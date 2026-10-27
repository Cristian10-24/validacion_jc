// Re-cruce de respuestas cuando cambia la lista de participantes.
// Reglas: se vuelven a cruzar las respuestas auto, sin_duenio y conflicto. Las decisiones del admin se respetan:
//   - descartada → no se toca;
//   - manual → se conserva mientras su participante exista; si lo eliminaron, se vuelve a cruzar.
import { ObjectId } from "mongodb";
import { construirIndice, cruzar, type ParticipanteClaves } from "./cruce";
import type { Respuesta } from "./db";
import { camposCruce } from "./registro";

type RespuestaCruce = Pick<Respuesta, "_id" | "cruce" | "participanteId" | "cruzadoPor" | "candidatos" | "norm">;
export type Actualizacion = { id: ObjectId; set: Pick<Respuesta, "participanteId" | "cruce" | "cruzadoPor" | "candidatos"> };

const mismo = (a: RespuestaCruce, b: Actualizacion["set"]) =>
  a.cruce === b.cruce &&
  (a.participanteId?.toHexString() ?? null) === (b.participanteId?.toHexString() ?? null) &&
  (a.cruzadoPor ?? null) === (b.cruzadoPor ?? null) &&
  (a.candidatos ?? []).map(String).sort().join() === (b.candidatos ?? []).map(String).sort().join();

/** Calcula qué respuestas cambian de dueño con la lista nueva. Función pura: no escribe. */
export function planRecruce(respuestas: RespuestaCruce[], participantes: ParticipanteClaves[]): Actualizacion[] {
  const ix = construirIndice(participantes);
  const existen = new Set(participantes.map((p) => p.id));
  const cambios: Actualizacion[] = [];
  for (const r of respuestas) {
    if (r.cruce === "descartada") continue;
    if (r.cruce === "manual" && r.participanteId && existen.has(r.participanteId.toHexString())) continue;
    const set = camposCruce(cruzar(r.norm, ix));
    if (!mismo(r, set)) cambios.push({ id: r._id, set });
  }
  return cambios;
}

/** $set / $unset para guardar una actualización sin dejar campos en null. */
export function operacionCruce(set: Actualizacion["set"]) {
  const $set: Record<string, unknown> = { cruce: set.cruce, participanteId: set.participanteId };
  const $unset: Record<string, ""> = {};
  if (set.cruzadoPor) $set.cruzadoPor = set.cruzadoPor; else $unset.cruzadoPor = "";
  if (set.candidatos?.length) $set.candidatos = set.candidatos; else $unset.candidatos = "";
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}
