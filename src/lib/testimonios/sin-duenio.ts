// "Sin dueño" (solo admin): respuestas que no se pudieron asignar solas (sin_duenio y conflicto) y las
// descartadas. El admin las asigna a un participante (cruce manual) o las descarta. Todo queda en la auditoría.
// Solo escribe en testimonios_respuestas y testimonios_auditoria.
import { ObjectId } from "mongodb";
import { testimonios, type Cruce, type Respuesta } from "./db";
import { parseMarcaTemporal } from "./estado";

export type CandidatoVista = { id: string; nombre: string; documento: string; ciudad: string; correo: string; celular: string };
export type RespuestaPorResolver = {
  id: string;
  cruce: "sin_duenio" | "conflicto" | "descartada";
  marcaTemporal: string;
  fecha: string | null;
  fila: number | null;
  norm: Respuesta["norm"];
  original: Record<string, unknown>;
  enlaces: string[];
  candidatos: CandidatoVista[];
  asignacion: { por: string; en: string; motivo?: string } | null;
};

const POR_RESOLVER: Cruce[] = ["sin_duenio", "conflicto"];
const SE_PUEDE_ASIGNAR: Cruce[] = ["sin_duenio", "conflicto", "descartada"];

const vistaParticipante = (p: { _id: ObjectId; nombre: string; documento: string; ciudad: string; correo: string; celular: string }): CandidatoVista =>
  ({ id: p._id.toHexString(), nombre: p.nombre, documento: p.documento, ciudad: p.ciudad, correo: p.correo, celular: p.celular });

/** Respuestas por resolver y descartadas (la más reciente primero), con sus candidatos, y la lista de participantes para buscar. */
export async function vistaSinDuenio(): Promise<{ respuestas: RespuestaPorResolver[]; participantes: CandidatoVista[] }> {
  const { participantes, respuestas } = await testimonios();
  const [lista, pendientes] = await Promise.all([
    participantes.find({}, { projection: { nombre: 1, documento: 1, ciudad: 1, correo: 1, celular: 1 } }).toArray(),
    respuestas.find({ cruce: { $in: ["sin_duenio", "conflicto", "descartada"] } }).toArray(),
  ]);
  const porId = new Map(lista.map((p) => [p._id.toHexString(), vistaParticipante(p)]));
  const filas = pendientes.map((r): RespuestaPorResolver => {
    const ms = parseMarcaTemporal(r.marcaTemporal) ?? r.recibidaEn.getTime();
    const asig = r.asignacion;
    return {
      id: r._id.toHexString(),
      cruce: r.cruce as RespuestaPorResolver["cruce"],
      marcaTemporal: r.marcaTemporal,
      fecha: new Date(ms).toISOString(),
      fila: r.fila,
      norm: r.norm,
      original: r.original,
      enlaces: r.enlaces,
      candidatos: (r.candidatos ?? []).map((c) => porId.get(c.toHexString())).filter((c): c is CandidatoVista => !!c),
      asignacion: asig ? { por: asig.por, en: asig.en.toISOString(), ...(asig.motivo ? { motivo: asig.motivo } : {}) } : null,
    };
  });
  filas.sort((a, b) => Date.parse(b.fecha ?? "") - Date.parse(a.fecha ?? ""));
  return { respuestas: filas, participantes: [...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) };
}

export type ResultadoAccion = { ok: true } | { ok: false; error: "no_encontrada" | "participante_no_existe" | "ya_resuelta" };

/** Asigna la respuesta a un participante: cruce manual, cruzadoPor "manual". El re-cruce la respeta. */
export async function asignarRespuesta(respuestaId: ObjectId, participanteId: ObjectId, por: string): Promise<ResultadoAccion> {
  const { participantes, respuestas, auditoria } = await testimonios();
  const [r, p] = await Promise.all([
    respuestas.findOne({ _id: respuestaId }, { projection: { cruce: 1, candidatos: 1, norm: 1 } }),
    participantes.findOne({ _id: participanteId }, { projection: { nombre: 1, documento: 1 } }),
  ]);
  if (!r) return { ok: false, error: "no_encontrada" };
  if (!p) return { ok: false, error: "participante_no_existe" };
  const antes = { cruceAnterior: r.cruce, candidatos: (r.candidatos ?? []).map(String), respuesta: r.norm };
  const en = new Date();
  // El filtro por cruce evita pisar una decisión que otro admin tomó al mismo tiempo.
  const res = await respuestas.updateOne(
    { _id: respuestaId, cruce: { $in: SE_PUEDE_ASIGNAR } },
    { $set: { cruce: "manual", participanteId, cruzadoPor: "manual", asignacion: { por, en } }, $unset: { candidatos: "" } },
  );
  if (res.matchedCount === 0) return { ok: false, error: "ya_resuelta" };
  await auditoria.insertOne({
    accion: "asignar_respuesta", por, fecha: en,
    detalle: { respuestaId: respuestaId.toHexString(), participanteId: participanteId.toHexString(), participante: p.nombre, documento: p.documento, ...antes },
  });
  return { ok: true };
}

/** Descarta la respuesta (prueba, duplicado, de alguien que no es del programa…). No cuenta para nadie. */
export async function descartarRespuesta(respuestaId: ObjectId, por: string, motivo: string): Promise<ResultadoAccion> {
  const { respuestas, auditoria } = await testimonios();
  const r = await respuestas.findOne({ _id: respuestaId }, { projection: { cruce: 1, candidatos: 1, norm: 1 } });
  if (!r) return { ok: false, error: "no_encontrada" };
  const antes = { cruceAnterior: r.cruce, candidatos: (r.candidatos ?? []).map(String), respuesta: r.norm };
  const en = new Date();
  const res = await respuestas.updateOne(
    { _id: respuestaId, cruce: { $in: POR_RESOLVER } },
    { $set: { cruce: "descartada", participanteId: null, asignacion: { por, en, ...(motivo ? { motivo } : {}) } }, $unset: { cruzadoPor: "" } },
  );
  if (res.matchedCount === 0) return { ok: false, error: "ya_resuelta" };
  await auditoria.insertOne({
    accion: "descartar_respuesta", por, fecha: en,
    detalle: { respuestaId: respuestaId.toHexString(), ...antes, motivo },
  });
  return { ok: true };
}
