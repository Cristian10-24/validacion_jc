// Panel de seguimiento de la clausura (monitores, coordinación y admin). Solo LEE.
// La lista sale de students (con el alcance del usuario, en la consulta) y se cruza con clausura_respuestas.
import { ObjectId, type Filter } from "mongodb";
import { scopeFilter, type SessionUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { celularConIndicativo } from "@/lib/testimonios/celular";
import type { Student } from "@/lib/types";
import { clausura, type Evento, type RespuestaClausura } from "./db";
import { GENEROS } from "./contacto";
import { formularioActivo, formularioDe, modoProyecto } from "./evento";
import { claveOtro, esPregunta, type Formulario } from "./formulario/esquema";
import { camino, preguntasDe } from "./formulario/motor";
import { ID_PRESENTA_PROYECTO } from "./formulario/proyecto";
import { respuestasLegibles, textoRespuesta, type SeccionLegible } from "./formulario/mostrar";

export type EstadoClausura = "sin_responder" | "en_progreso" | "respondio";
export type ComentarioVista = { id: string; texto: string; autor: { nombre: string; usuario: string; rol: string }; fecha: string; editadoEn: string | null };

export type FilaClausura = {
  id: string;
  nombre: string;
  documento: string;
  ciudad: string;
  grupo: string;
  estado: EstadoClausura;
  /** Opción elegida en la pregunta de asistencia (id y texto), o null. */
  asistencia: { id: string; texto: string } | null;
  correo: string;
  correoCambio: boolean;
  celular: string;
  whatsapp: string;
  actualizada: string | null;
  enviadaEn: string | null;
  editando: boolean;
  /** El admin la reabrió: el estudiante puede editarla y debe volver a enviarla. */
  reabierta: { por: string; en: string } | null;
  /** Género del estudiante (de la sección de contacto). */
  genero: string;
  /** ¿Presenta proyecto? null = el evento no tiene proyecto o aún no respondió. nombre = nombre del proyecto. */
  proyecto: { presenta: boolean; nombre: string } | null;
  secciones: SeccionLegible[];
  comentarios: ComentarioVista[];
};

export type EventoPanel = { id: string; slug: string; titulo: string; nombreVisible: string; estado: Evento["estado"]; ciudades: string[]; proyecto: "obligatorio" | "opcional" | "no" };

/** Eventos que el usuario puede ver: los que cubren alguna de sus ciudades (coordinación y admin: todos). */
export function eventosVisibles(eventos: Evento[], user: Pick<SessionUser, "rol" | "ciudades">): Evento[] {
  const todas = puede(user.rol, "ver_todas_las_ciudades");
  return eventos.filter((e) => todas || (e.estado !== "borrador" && e.ciudades.some((c) => user.ciudades.includes(c))));
}

/** Alcance de estudiantes de un evento para este usuario (filtro en la consulta, nunca después). */
export function alcanceEvento(evento: Pick<Evento, "ciudades">, user: Pick<SessionUser, "rol" | "ciudades">): Filter<Student> {
  return { $and: [scopeFilter(user), { ciudad: { $in: evento.ciudades } }] };
}

/** Formularios (ya con la regla del proyecto y los textos resueltos) de cada versión usada. */
export async function formulariosPorVersion(evento: Evento, versiones: number[]): Promise<Map<number, Formulario>> {
  const listo = (f: Formulario) => formularioDe(evento, formularioActivo(evento, f));
  const m = new Map<number, Formulario>([[evento.formularioVersion, listo(evento.formulario)]]);
  const faltan = [...new Set(versiones)].filter((v) => !m.has(v));
  if (faltan.length) {
    const { formularios } = await clausura();
    for (const f of await formularios.find({ eventoId: evento._id, version: { $in: faltan } }).toArray()) m.set(f.version, listo(f.formulario));
  }
  return m;
}

/** ¿Presenta proyecto? Según el camino de sus respuestas y el modo del evento (obligatorio / opcional / no). */
export function proyectoDe(evento: Evento, f: Formulario, r: RespuestaClausura | undefined): FilaClausura["proyecto"] {
  if (!r || modoProyecto(evento) === "no") return null;
  const paso = camino(f, r.respuestas).pasos.find((p) => p.seccion.proyecto);
  if (!paso) return r.estado === "enviada" ? { presenta: false, nombre: "" } : null;
  if (modoProyecto(evento) === "opcional" && r.respuestas[ID_PRESENTA_PROYECTO] !== "si") {
    return r.respuestas[ID_PRESENTA_PROYECTO] === "no" ? { presenta: false, nombre: "" } : null;
  }
  const nombre = paso.items.find((i) => esPregunta(i) && i.tipo === "texto" && i.formato !== "url" && i.id !== ID_PRESENTA_PROYECTO);
  return { presenta: true, nombre: nombre ? String(r.respuestas[nombre.id] ?? "") : "" };
}

function whatsappTexto(r: RespuestaClausura, ciudad: string): string {
  const c = r.contacto;
  if (!c) return "";
  if (!c.tieneWhatsApp) return "No tiene";
  return c.whatsapp ? celularConIndicativo(c.whatsapp, ciudad) : "Mismo número";
}

export type DatosPanel = {
  eventos: EventoPanel[];
  evento: EventoPanel | null;
  asistencia: { titulo: string; opciones: { id: string; texto: string }[] } | null;
  filas: FilaClausura[];
};

export async function datosPanel(user: Pick<SessionUser, "rol" | "ciudades">, eventoId?: string | null): Promise<DatosPanel> {
  const { eventos, estudiantes, respuestas, comentarios } = await clausura();
  const visibles = eventosVisibles(await eventos.find({}).sort({ inicio: 1 }).toArray(), user);
  const lista: EventoPanel[] = visibles.map((e) => ({ id: e._id.toHexString(), slug: e.slug, titulo: e.titulo, nombreVisible: e.nombreVisible, estado: e.estado, ciudades: e.ciudades, proyecto: modoProyecto(e) }));
  const evento = visibles.find((e) => e._id.toHexString() === eventoId) ?? visibles.find((e) => e.estado === "abierto") ?? visibles[0] ?? null;
  if (!evento) return { eventos: lista, evento: null, asistencia: null, filas: [] };

  const alumnos = (await estudiantes.find(alcanceEvento(evento, user), {
    projection: { documento: 1, nombre: 1, nombrePropuesto: 1, ciudad: 1, grupo: 1, correo: 1, correoPropuesto: 1 },
  }).toArray()) as Pick<Student, "_id" | "documento" | "nombre" | "nombrePropuesto" | "ciudad" | "grupo" | "correo" | "correoPropuesto">[];
  const ids = alumnos.map((a) => a._id);
  const [resp, notas] = await Promise.all([
    respuestas.find({ eventoId: evento._id, studentId: { $in: ids } }).toArray(),
    comentarios.find({ eventoId: evento._id, studentId: { $in: ids } }).sort({ fecha: 1 }).toArray(),
  ]);
  const forms = await formulariosPorVersion(evento, resp.map((r) => r.formularioVersion));
  const porAlumno = new Map(resp.map((r) => [r.studentId.toHexString(), r]));
  const notasDe = new Map<string, ComentarioVista[]>();
  for (const c of notas) {
    const k = c.studentId.toHexString();
    notasDe.set(k, [...(notasDe.get(k) ?? []), { id: c._id.toHexString(), texto: c.texto, autor: c.autor, fecha: c.fecha.toISOString(), editadoEn: c.editadoEn?.toISOString() ?? null }]);
  }

  const pa = evento.preguntaAsistencia ? preguntasDe(forms.get(evento.formularioVersion)!).get(evento.preguntaAsistencia) : undefined;
  const asistencia = pa && esPregunta(pa)
    ? { titulo: pa.titulo, opciones: pa.tipo === "sino" ? [{ id: "si", texto: "Sí" }, { id: "no", texto: "No" }] : (pa.opciones ?? []).filter((o) => !o.archivada).map((o) => ({ id: o.id, texto: o.texto })) }
    : null;

  const filas = alumnos.map((a): FilaClausura => {
    const k = a._id.toHexString();
    const r = porAlumno.get(k);
    const f = (r && forms.get(r.formularioVersion)) || forms.get(evento.formularioVersion)!;
    const v = pa && r ? r.respuestas[pa.id] : undefined;
    const c = r?.contacto;
    return {
      id: k, nombre: a.nombrePropuesto ?? a.nombre, documento: a.documento, ciudad: a.ciudad, grupo: a.grupo ?? "",
      estado: !r ? "sin_responder" : r.estado === "enviada" ? "respondio" : "en_progreso",
      asistencia: pa && v !== undefined ? { id: String(v), texto: textoRespuesta(pa, v, r?.respuestas[claveOtro(pa.id)]) } : null,
      correo: c ? (c.correoConfirmado ? c.correoMostrado : c.correoNuevo ?? "") : a.correoPropuesto ?? a.correo ?? "",
      correoCambio: !!c && !c.correoConfirmado,
      celular: c?.celular ? celularConIndicativo(c.celular, a.ciudad) : "",
      whatsapp: r ? whatsappTexto(r, a.ciudad) : "",
      actualizada: r?.actualizadaEn.toISOString() ?? null,
      enviadaEn: r?.enviadaEn?.toISOString() ?? null,
      editando: !!r?.borradorEdicion,
      reabierta: r?.reabierta ? { por: r.reabierta.por, en: r.reabierta.en.toISOString() } : null,
      genero: c?.genero ? GENEROS[c.genero] : "",
      proyecto: proyectoDe(evento, f, r),
      secciones: r ? respuestasLegibles(f, r.respuestas) : [],
      comentarios: notasDe.get(k) ?? [],
    };
  });
  return { eventos: lista, evento: lista.find((e) => e.id === evento._id.toHexString())!, asistencia, filas };
}

/** Estudiante dentro del alcance del usuario y del evento; null si no (→ 404). */
export async function estudianteEnAlcance(user: Pick<SessionUser, "rol" | "ciudades">, eventoId: string, studentId: string) {
  if (!ObjectId.isValid(eventoId) || !ObjectId.isValid(studentId)) return null;
  const { eventos, estudiantes } = await clausura();
  const evento = await eventos.findOne({ _id: new ObjectId(eventoId) });
  if (!evento || !eventosVisibles([evento], user).length) return null;
  const s = await estudiantes.findOne({ _id: new ObjectId(studentId), ...alcanceEvento(evento, user) }, { projection: { _id: 1 } });
  return s ? { evento, studentId: s._id } : null;
}
