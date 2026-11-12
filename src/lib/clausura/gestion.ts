// Gestión de eventos desde el admin (sin depender del script). Usa las MISMAS reglas que scripts/clausura-evento.ts:
// esquema EventoArchivo, validarFormulario, revisarEventoArchivo, [POR DEFINIR] y un solo evento abierto por ciudad.
// Solo escribe en clausura_eventos, clausura_formularios y clausura_auditoria.
import { ObjectId } from "mongodb";
import { z } from "zod";
import plantillaArchivo from "../../../eventos/cali.json";
import { clausura, type Evento } from "./db";
import { datosDesdeArchivo, EventoArchivo, mismaCiudad, pendientesDe, POR_DEFINIR, revisarEventoArchivo, TIPOS_EVENTO } from "./evento";
import { Formulario } from "./formulario/esquema";
import { validarFormulario } from "./formulario/motor";
import { MODOS_ACOMPANANTE } from "./formulario/acompanante";
import { MODOS_PROYECTO } from "./formulario/proyecto";

// ---------- Fechas: el admin escribe la hora local del evento; se guarda con su zona ----------

/** "-05:00" para America/Bogota en ese instante. */
export function offsetDe(tz: string, instante: Date): string {
  const v = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(instante).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return v === "GMT" ? "+00:00" : v.replace("GMT", "");
}

/** "2026-11-14T09:00" (hora local del evento) → "2026-11-14T09:00:00-05:00". */
export function localAIso(local: string, tz: string): string {
  return `${local}:00${offsetDe(tz, new Date(`${local}:00Z`))}`;
}

/** Fecha guardada → "2026-11-14T09:00" en la zona del evento (para el campo datetime-local). */
export function isoALocal(d: Date, tz: string): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

// ---------- Datos que llegan del formulario del admin ----------

const Local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Fecha y hora");
export const DatosEvento = z.object({
  slug: z.string().max(60),
  tipo: z.enum(["expoferia", "clausura"]),
  titulo: z.string().trim().min(1).max(120),
  kicker: z.string().trim().min(1).max(40),
  nombreVisible: z.string().trim().min(1).max(60),
  ciudades: z.array(z.string().min(1).max(60)).min(1).max(20),
  descripcion: z.string().max(5000),
  lugar: z.string().trim().min(1).max(150),
  direccion: z.string().trim().min(1).max(200),
  mapaUrl: z.string().max(500).nullable(),
  zonaHoraria: z.string().max(60),
  inicio: Local,
  fin: Local.nullable(),
  /** Hora de llegada (citación). Vacía = la misma del inicio. */
  citacion: Local.nullable().default(null),
  fechaLimite: Local.nullable(),
  imagen: z.string().max(200).nullable(),
  permitirEdicion: z.boolean(),
  proyecto: z.enum(MODOS_PROYECTO),
  /** ¿Pueden llevar acompañante? Si no llega, "si" (como antes). */
  acompanante: z.enum(MODOS_ACOMPANANTE).default("si"),
}).strict();
export type DatosEvento = z.infer<typeof DatosEvento>;

export const NuevoEvento = DatosEvento.extend({
  /** De dónde copiar las preguntas: el id de otro evento o "plantilla" (el formulario estándar de eventos/cali.json). */
  copiarDe: z.string().max(24),
}).strict();

const plantilla = () => {
  const a = plantillaArchivo as unknown as { formulario: unknown; preguntaAsistencia: string; opcionesAsisten: string[] };
  return { formulario: Formulario.parse(a.formulario), preguntaAsistencia: a.preguntaAsistencia, opcionesAsisten: a.opcionesAsisten };
};

export type Resultado = { ok: true; evento: Evento } | { ok: false; status: number; errores: string[] };
const falla = (errores: string[], status = 400): Resultado => ({ ok: false, status, errores });

/** Arma el "archivo" del evento (mismo formato del JSON) y lo valida con las reglas de siempre. */
function validar(d: DatosEvento, base: { formulario: Formulario; preguntaAsistencia: string | null; opcionesAsisten: string[]; estado: Evento["estado"] }) {
  const archivo = {
    slug: d.slug, tipo: d.tipo, titulo: d.titulo, kicker: d.kicker, nombreVisible: d.nombreVisible, ciudades: d.ciudades,
    descripcion: d.descripcion, lugar: d.lugar, direccion: d.direccion, mapaUrl: d.mapaUrl || null, zonaHoraria: d.zonaHoraria,
    inicio: localAIso(d.inicio, d.zonaHoraria), fin: d.fin ? localAIso(d.fin, d.zonaHoraria) : null,
    citacion: d.citacion ? localAIso(d.citacion, d.zonaHoraria) : null,
    fechaLimite: d.fechaLimite ? localAIso(d.fechaLimite, d.zonaHoraria) : null,
    imagen: d.imagen || null, estado: base.estado, permitirEdicion: d.permitirEdicion, proyecto: d.proyecto, acompanante: d.acompanante,
    preguntaAsistencia: base.preguntaAsistencia, opcionesAsisten: base.opcionesAsisten, formulario: base.formulario,
  };
  const r = EventoArchivo.safeParse(archivo);
  if (!r.success) return { errores: r.error.issues.map((i) => `${i.path.join(".") || "evento"}: ${i.message}`) };
  const errores = [...validarFormulario(r.data.formulario), ...revisarEventoArchivo(r.data)];
  const faltan = pendientesDe(archivo);
  if (faltan.length && base.estado !== "borrador") errores.push(`No se puede dejar ${base.estado}: faltan datos ${POR_DEFINIR} (${faltan.join(", ")})`);
  return errores.length ? { errores } : { datos: datosDesdeArchivo(r.data) };
}

/** ¿Hay otro evento abierto para alguna de esas ciudades? */
async function choque(slug: string, ciudades: string[]): Promise<string | null> {
  const { eventos } = await clausura();
  const otros = await eventos.find({ estado: "abierto", slug: { $ne: slug } }, { projection: { slug: 1, ciudades: 1 } }).toArray();
  return otros.find((o) => o.ciudades.some((c) => ciudades.some((x) => mismaCiudad(c, x))))?.slug ?? null;
}

export async function crearEvento(body: z.infer<typeof NuevoEvento>, por: string): Promise<Resultado> {
  const { eventos, formularios, auditoria } = await clausura();
  const { copiarDe, ...d } = body;
  let base: { formulario: Formulario; preguntaAsistencia: string | null; opcionesAsisten: string[] };
  if (copiarDe === "plantilla") base = plantilla();
  else {
    const origen = ObjectId.isValid(copiarDe) ? await eventos.findOne({ _id: new ObjectId(copiarDe) }) : null;
    if (!origen) return falla(["El evento del que se copian las preguntas no existe"]);
    base = { formulario: origen.formulario, preguntaAsistencia: origen.preguntaAsistencia, opcionesAsisten: origen.opcionesAsisten ?? [] };
  }
  if (await eventos.findOne({ slug: d.slug }, { projection: { _id: 1 } })) return falla([`Ya existe un evento con la dirección /clausura/${d.slug}`], 409);
  const v = validar(d, { ...base, estado: "borrador" });
  if (!v.datos) return falla(v.errores);
  const ahora = new Date();
  const evento: Evento = { _id: new ObjectId(), ...v.datos, formularioVersion: 1, creadoEn: ahora, actualizadoEn: ahora, actualizadoPor: por };
  await eventos.insertOne(evento);
  await formularios.insertOne({ _id: new ObjectId(), eventoId: evento._id, version: 1, formulario: evento.formulario, guardadoEn: ahora, guardadoPor: por });
  await auditoria.insertOne({ accion: "crear", eventoId: evento._id, slug: evento.slug, detalle: { desde: "admin", copiarDe }, por, fecha: ahora });
  return { ok: true, evento };
}

export async function actualizarEvento(id: string, d: DatosEvento, por: string): Promise<Resultado> {
  const { eventos, auditoria } = await clausura();
  const actual = ObjectId.isValid(id) ? await eventos.findOne({ _id: new ObjectId(id) }) : null;
  if (!actual) return falla(["El evento no existe"], 404);
  if (d.slug !== actual.slug) return falla(["La dirección del evento no se puede cambiar"]);
  const v = validar(d, { formulario: actual.formulario, preguntaAsistencia: actual.preguntaAsistencia, opcionesAsisten: actual.opcionesAsisten ?? [], estado: actual.estado });
  if (!v.datos) return falla(v.errores);
  if (actual.estado === "abierto") {
    const otro = await choque(actual.slug, v.datos.ciudades);
    if (otro) return falla([`Ya hay otro evento abierto para esa ciudad: ${otro}`], 409);
  }
  const ahora = new Date();
  const { formulario: _f, estado: _e, ...cambios } = v.datos;
  await eventos.updateOne({ _id: actual._id }, { $set: { ...cambios, actualizadoEn: ahora, actualizadoPor: por } });
  await auditoria.insertOne({ accion: "editar", eventoId: actual._id, slug: actual.slug, detalle: { desde: "admin" }, por, fecha: ahora });
  return { ok: true, evento: (await eventos.findOne({ _id: actual._id }))! };
}

/** Abrir / cerrar / volver a borrador, y permitir o no editar después de enviar. */
export async function cambiarEstado(id: string, cambio: { estado?: Evento["estado"]; permitirEdicion?: boolean }, por: string): Promise<Resultado> {
  const { eventos, auditoria } = await clausura();
  const actual = ObjectId.isValid(id) ? await eventos.findOne({ _id: new ObjectId(id) }) : null;
  if (!actual) return falla(["El evento no existe"], 404);
  if (cambio.estado === "abierto") {
    const faltan = pendientesDe({ lugar: actual.lugar, direccion: actual.direccion, descripcion: actual.descripcion, formulario: actual.formulario });
    if (faltan.length) return falla([`No se puede abrir: faltan datos ${POR_DEFINIR} (${faltan.join(", ")})`]);
    const otro = await choque(actual.slug, actual.ciudades);
    if (otro) return falla([`Ya hay otro evento abierto para esa ciudad: ${otro}. Ciérralo primero.`], 409);
  }
  const ahora = new Date();
  await eventos.updateOne({ _id: actual._id }, { $set: { ...cambio, actualizadoEn: ahora, actualizadoPor: por } });
  await auditoria.insertOne({ accion: "estado", eventoId: actual._id, slug: actual.slug, detalle: { antes: { estado: actual.estado, permitirEdicion: actual.permitirEdicion }, despues: cambio }, por, fecha: ahora });
  return { ok: true, evento: (await eventos.findOne({ _id: actual._id }))! };
}

/** Valores para precargar el formulario del admin. */
export function datosParaEditar(e: Evento): DatosEvento {
  const tipo = e.tipo === "expoferia" ? "expoferia" : "clausura";
  return {
    slug: e.slug, tipo, titulo: e.titulo, kicker: e.kicker || TIPOS_EVENTO[tipo].kicker, nombreVisible: e.nombreVisible, ciudades: e.ciudades,
    descripcion: e.descripcion, lugar: e.lugar, direccion: e.direccion, mapaUrl: e.mapaUrl, zonaHoraria: e.zonaHoraria,
    inicio: isoALocal(e.inicio, e.zonaHoraria), fin: e.fin ? isoALocal(e.fin, e.zonaHoraria) : null,
    citacion: e.citacion ? isoALocal(e.citacion, e.zonaHoraria) : null,
    fechaLimite: e.fechaLimite ? isoALocal(e.fechaLimite, e.zonaHoraria) : null,
    imagen: e.imagen, permitirEdicion: e.permitirEdicion, proyecto: e.proyecto ?? "no", acompanante: e.acompanante ?? "si",
  };
}
