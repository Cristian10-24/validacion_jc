// Normalización y cruce de las respuestas de "Encuesta-Final-2026" con la lista de participantes.
// Funciones puras (sin base de datos). Reutiliza las claves y el cruce de testimonios sin modificarlos:
// documento normalizado (sin puntos, guiones ni espacios; conserva ceros a la izquierda) y, si no coincide, correo.
import { createHash } from "node:crypto";
import { headerKey } from "@/lib/excel";
import { cleanSpaces, toProperName } from "@/lib/validation/name";
import { resolverCiudad } from "@/lib/testimonios/ciudades";
import { claveCorreo, claveDocumento, construirIndice, cruzar, type Indice } from "@/lib/testimonios/cruce";
import { parseMarcaTemporal } from "@/lib/testimonios/estado";

export type RespuestaEncuestaNorm = {
  marcaTemporal: string;
  nombre: string;
  documento: string | null;
  correo: string | null;
  /** Ciudad del catálogo; si no se reconoce, el texto tal como vino. */
  ciudad: string;
};

/** Encuentra la columna por palabras clave (los encabezados del Form pueden variar un poco). */
function campo(original: Record<string, unknown>, ...claves: string[][]): string {
  const entradas = Object.entries(original).map(([k, v]) => [headerKey(k), v == null ? "" : String(v)] as const);
  for (const palabras of claves) {
    const hit = entradas.find(([k]) => palabras.every((p) => k.includes(p)));
    if (hit && hit[1].trim()) return hit[1].trim();
  }
  return "";
}

/**
 * Columnas esperadas (A–E de la pestaña Encuesta-Final-2026):
 * Marca temporal | Correo electrónico | Nombre completo | Número de documento de identidad | A qué ciudad pertenece tu grupo?
 */
export function normalizarRespuestaEncuesta(original: Record<string, unknown>): RespuestaEncuestaNorm {
  const ciudadTexto = cleanSpaces(campo(original, ["ciudad"]));
  return {
    marcaTemporal: campo(original, ["marca", "temporal"], ["timestamp"]),
    nombre: toProperName(cleanSpaces(campo(original, ["nombre"]))),
    documento: claveDocumento(campo(original, ["documento"], ["identificacion"], ["cedula"])),
    correo: claveCorreo(campo(original, ["correo"], ["email"], ["e", "mail"])),
    ciudad: resolverCiudad(ciudadTexto).ciudad ?? ciudadTexto,
  };
}

/** Clave de idempotencia: la misma respuesta enviada dos veces produce la misma clave (no depende del número de fila). */
export function claveRespuestaEncuesta(r: RespuestaEncuestaNorm): string {
  return createHash("sha256").update(["encuesta", r.marcaTemporal, r.documento ?? "", r.correo ?? "", r.nombre].join("|")).digest("hex");
}

// ---------- Cruce (se calcula al leer: si cambia la lista de participantes, las respuestas se vuelven a cruzar solas) ----------

export type ParticipanteCruce = { id: string; documento: string | null; correo: string | null };
export type RespuestaCruce = { id: string; marcaTemporal: string; recibidaEn: Date; norm: Pick<RespuestaEncuestaNorm, "documento" | "correo"> };

export function indiceEncuesta(lista: ParticipanteCruce[]): Indice {
  return construirIndice(lista.map((p) => ({ ...p, celular: null })));
}

/** Fecha de la respuesta en ms: la marca temporal del Sheet; si no se entiende, cuando llegó a la app. */
export function msRespuesta(r: Pick<RespuestaCruce, "marcaTemporal" | "recibidaEn">): number {
  return parseMarcaTemporal(r.marcaTemporal) ?? r.recibidaEn.getTime();
}

export type Asignada<R> = { respuesta: R; por: "documento" | "correo"; total: number };
export type NoAsignada<R> = { respuesta: R; motivo: "sin_coincidencia" | "conflicto"; candidatos: string[] };

/**
 * Asigna cada respuesta a un participante: primero por documento y, si no coincide con nadie, por correo
 * (solo si el correo es de un único participante). Si alguien respondió varias veces, cuenta la más reciente.
 * Las que no coinciden con nadie (o con varios por correo) quedan en noAsignadas, para revisarlas a mano.
 */
export function asignarRespuestas<R extends RespuestaCruce>(respuestas: R[], ix: Indice): { porParticipante: Map<string, Asignada<R>>; noAsignadas: NoAsignada<R>[] } {
  const porParticipante = new Map<string, Asignada<R>>();
  const noAsignadas: NoAsignada<R>[] = [];
  for (const r of respuestas) {
    const c = cruzar({ documento: r.norm.documento, correo: r.norm.correo, celular: null }, ix);
    if (c.cruce === "sin_duenio") { noAsignadas.push({ respuesta: r, motivo: "sin_coincidencia", candidatos: [] }); continue; }
    if (c.cruce === "conflicto") { noAsignadas.push({ respuesta: r, motivo: "conflicto", candidatos: c.candidatos }); continue; }
    const actual = porParticipante.get(c.participanteId);
    const por = c.por === "documento" ? "documento" : "correo";
    if (!actual) porParticipante.set(c.participanteId, { respuesta: r, por, total: 1 });
    else {
      const masReciente = msRespuesta(r) > msRespuesta(actual.respuesta);
      porParticipante.set(c.participanteId, masReciente ? { respuesta: r, por, total: actual.total + 1 } : { ...actual, total: actual.total + 1 });
    }
  }
  noAsignadas.sort((a, b) => msRespuesta(b.respuesta) - msRespuesta(a.respuesta));
  return { porParticipante, noAsignadas };
}
