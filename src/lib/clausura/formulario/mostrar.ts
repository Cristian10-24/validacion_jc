// Texto legible de las respuestas (resumen del estudiante, panel de monitores y, más adelante, el Excel). Funciones puras.
import { claveOtro, esPregunta, type Formulario, type Pregunta, type Respuestas, type Valor } from "./esquema";
import { camino, eligioOtro } from "./motor";

export function textoFechaCorta(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}

/** Valor como texto: opciones por su texto, "Otro: <texto>", casillas unidas con ", ", sí/no, fechas legibles. */
export function textoRespuesta(p: Pregunta, v: Valor | undefined, otro?: Valor): string {
  if (v === undefined || v === null || v === "") return "";
  if (eligioOtro(p, v)) return `Otro: ${otro ?? ""}`.trim();
  const opcion = (id: string) => p.opciones?.find((o) => o.id === id)?.texto ?? id;
  switch (p.tipo) {
    case "unica": case "desplegable": return opcion(String(v));
    case "casillas": return (Array.isArray(v) ? v : [String(v)]).map(opcion).join(", ");
    case "sino": return v === "si" ? "Sí" : v === "no" ? "No" : String(v);
    case "fecha": return textoFechaCorta(String(v));
    default: return Array.isArray(v) ? v.join(", ") : String(v);
  }
}

export type SeccionLegible = { id: string; titulo: string; preguntas: { id: string; titulo: string; texto: string }[] };

/** Secciones del camino con sus preguntas visibles y lo que respondió (en blanco si no respondió). */
export function respuestasLegibles(f: Formulario, r: Respuestas): SeccionLegible[] {
  return camino(f, r).pasos
    .map((p) => ({
      id: p.seccion.id,
      titulo: p.seccion.titulo,
      preguntas: p.items.filter(esPregunta).map((q) => ({ id: q.id, titulo: q.titulo, texto: textoRespuesta(q, r[q.id], r[claveOtro(q.id)]) })),
    }))
    .filter((s) => s.preguntas.length > 0);
}
