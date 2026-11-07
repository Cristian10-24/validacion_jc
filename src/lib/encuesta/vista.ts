// Lectura de la vista "Encuesta final" según el usuario. Solo LEE (encuesta_* y testimonios_participantes).
// El alcance por ciudad es el mismo de testimonios: un monitor solo ve participantes de sus ciudades.
import { infoInactivo, type InfoInactivo } from "@/lib/activo";
import type { SessionUser } from "@/lib/auth";
import { alcanceTestimonios } from "@/lib/testimonios/vista";
import { ultimaActividad } from "@/lib/testimonios/estado";
import { asignarRespuestas, indiceEncuesta, msRespuesta, type NoAsignada } from "./cruce";
import { encuesta, type ParticipanteLectura, type RespuestaEncuesta } from "./db";

export type EstadoEncuesta = "respondio" | "pendiente";
export type ComentarioVista = { id: string; texto: string; autor: { nombre: string; usuario: string; rol: string }; fecha: string; editadoEn: string | null };
export type FilaEncuesta = {
  id: string;
  nombre: string;
  documento: string;
  ciudad: string;
  ciudadOriginal: string | null;
  celular: string;
  correo: string;
  estado: EstadoEncuesta;
  /** Respuesta más reciente (si respondió varias veces, total dice cuántas). */
  respuesta: { fecha: string; por: "documento" | "correo"; total: number } | null;
  conComentarios: boolean;
  comentarios: ComentarioVista[]; // en orden cronológico
  ultimaRespuesta: number | null;
  ultimoComentario: number | null;
  ultimoComentarioEditado: boolean;
  /** null si está activo. Los inactivos vienen en la lista (filtro "Mostrar inactivos") pero no cuentan. */
  inactivo: InfoInactivo;
};

type RespLeida = Pick<RespuestaEncuesta, "marcaTemporal" | "recibidaEn" | "norm" | "original" | "fila"> & { id: string };

/** Lee todas las respuestas y TODOS los participantes (el cruce necesita la lista completa) y asigna. */
async function cruceCompleto() {
  const { participantes, respuestas } = await encuesta();
  const [todos, resp] = await Promise.all([
    participantes.find({}, { projection: { documento: 1, correo: 1, nombre: 1, ciudad: 1 } }).toArray(),
    respuestas.find({}, { projection: { marcaTemporal: 1, recibidaEn: 1, norm: 1, original: 1, fila: 1 } }).toArray(),
  ]);
  const ix = indiceEncuesta(todos.map((p) => ({ id: p._id.toHexString(), documento: p.documento || null, correo: p.correo || null })));
  const leidas: RespLeida[] = resp.map((r) => ({ id: r._id.toHexString(), marcaTemporal: r.marcaTemporal, recibidaEn: r.recibidaEn, norm: r.norm, original: r.original, fila: r.fila }));
  return { todos, ...asignarRespuestas(leidas, ix) };
}

export async function filasEncuesta(user: Pick<SessionUser, "rol" | "ciudades">): Promise<FilaEncuesta[]> {
  const { participantes, comentarios } = await encuesta();
  const lista = (await participantes.find(alcanceTestimonios(user), {
    projection: { documento: 1, nombre: 1, correo: 1, celular: 1, ciudad: 1, ciudadOriginal: 1, activo: 1, inactivoMotivo: 1, inactivoEn: 1, inactivoPor: 1 },
  }).toArray()) as ParticipanteLectura[];
  const ids = lista.map((p) => p._id);
  const [{ porParticipante }, notas] = await Promise.all([
    cruceCompleto(),
    comentarios.find({ participanteId: { $in: ids } }).sort({ fecha: 1 }).toArray(),
  ]);

  const notasDe = new Map<string, ComentarioVista[]>();
  for (const c of notas) {
    const k = c.participanteId.toHexString();
    notasDe.set(k, [...(notasDe.get(k) ?? []), { id: c._id.toHexString(), texto: c.texto, autor: c.autor, fecha: c.fecha.toISOString(), editadoEn: c.editadoEn?.toISOString() ?? null }]);
  }

  return lista.map((p) => {
    const k = p._id.toHexString();
    const a = porParticipante.get(k);
    const ms = a ? msRespuesta(a.respuesta) : null;
    const cm = notasDe.get(k) ?? [];
    const ua = ultimaActividad(cm);
    return {
      id: k, nombre: p.nombre, documento: p.documento, ciudad: p.ciudad, ciudadOriginal: p.ciudadOriginal ?? null,
      celular: p.celular ?? "", correo: p.correo ?? "",
      estado: a ? "respondio" : "pendiente",
      respuesta: a && ms !== null ? { fecha: new Date(ms).toISOString(), por: a.por, total: a.total } : null,
      conComentarios: cm.length > 0, comentarios: cm,
      ultimaRespuesta: ms,
      ultimoComentario: ua?.ms ?? null,
      ultimoComentarioEditado: ua?.editado ?? false,
      inactivo: infoInactivo(p),
    };
  });
}

// ---------- Respuestas sin coincidencia (solo administración) ----------

export type FilaSinCoincidencia = {
  id: string;
  fecha: string;
  marcaTemporal: string;
  fila: number | null;
  nombre: string;
  documento: string | null;
  correo: string | null;
  ciudad: string;
  original: Record<string, unknown>;
  motivo: NoAsignada<RespLeida>["motivo"];
  /** En conflicto: el correo coincide con varios participantes. */
  candidatos: { nombre: string; documento: string; ciudad: string }[];
};

export async function respuestasSinCoincidencia(): Promise<FilaSinCoincidencia[]> {
  const { todos, noAsignadas } = await cruceCompleto();
  const porId = new Map(todos.map((p) => [p._id.toHexString(), p]));
  return noAsignadas.map(({ respuesta: r, motivo, candidatos }) => ({
    id: r.id, fecha: new Date(msRespuesta(r)).toISOString(), marcaTemporal: r.marcaTemporal, fila: r.fila,
    nombre: r.norm.nombre, documento: r.norm.documento, correo: r.norm.correo, ciudad: r.norm.ciudad, original: r.original, motivo,
    candidatos: candidatos.map((id) => porId.get(id)).filter((p) => !!p).map((p) => ({ nombre: p.nombre, documento: p.documento, ciudad: p.ciudad })),
  }));
}

export async function contarSinCoincidencia(): Promise<number> {
  return (await cruceCompleto()).noAsignadas.length;
}
