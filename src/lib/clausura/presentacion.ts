// Presentación de la portada pública de la clausura (solo textos derivados de los datos; sin acceso a la base).
// Funciones puras: las usan el servidor (páginas) y el navegador (estados), y tienen pruebas.
import { esSeccionAcompanante } from "./formulario/acompanante";
import type { Formulario } from "./formulario/esquema";

/** Un texto con marcadores tipo "[HORA]", "[POR DEFINIR]" o "[...]" no se muestra: devuelve null y la línea se oculta. */
export function sinMarcadores(t: string | null | undefined): string | null {
  const s = (t ?? "").trim();
  return !s || /\[[^\]]*\]/.test(s) ? null : s;
}

/** Fecha (AAAA-MM-DD) de un instante en la zona dada. */
const fechaEnZona = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** Días de calendario (en la zona del evento) que faltan hasta la fecha límite. null si ya venció. */
export function diasParaCerrar(limite: Date, tz: string, ahora = new Date()): number | null {
  if (ahora >= limite) return null;
  const [a, b] = [fechaEnZona(ahora, tz), fechaEnZona(limite, tz)].map((f) => Date.parse(`${f}T00:00:00Z`));
  return Math.round((b! - a!) / 864e5);
}

/** "Quedan 5 días" · "Queda 1 día" · "Último día" (si cierra hoy, en la zona del evento) · null si ya cerró. */
export function textoQuedan(limite: Date | null | undefined, tz: string, ahora = new Date()): string | null {
  if (!limite) return null;
  const n = diasParaCerrar(limite, tz, ahora);
  if (n === null) return null;
  if (n <= 0) return "Último día";
  return n === 1 ? "Queda 1 día" : `Quedan ${n} días`;
}

/** ¿El formulario tiene la sección de acompañante? (por su ID o su título) */
export function tieneAcompanante(f: Formulario): boolean {
  return f.secciones.some((s) => !s.archivada && esSeccionAcompanante(s));
}

export type PreguntaFrecuente = { pregunta: string; respuesta: string };

/** Respuesta de "¿Puedo llevar un acompañante?" según los eventos (null = no se muestra la pregunta). */
export function respuestaAcompanante(eventos: { formulario: Formulario; acompanante?: "si" | "no" }[]): string | null {
  const con = eventos.filter((e) => e.acompanante !== "no" && tieneAcompanante(e.formulario));
  const sin = eventos.filter((e) => e.acompanante === "no");
  const SI = "Puedes llevar solo un acompañante. Lo indicas en el formulario.";
  if (!sin.length) return con.length ? SI : null;
  if (!con.length) return "No. Para la clausura no se permiten acompañantes.";
  // Sin nombrar ciudades: todavía no se sabe en cuáles se podrá.
  return "Depende de tu ciudad. En las ciudades donde se permite, puedes llevar solo un acompañante y lo indicas en el formulario.";
}

/**
 * Preguntas frecuentes según la configuración de los eventos que se muestran (no fijas):
 *  - acompañante: según el campo "acompanante" de cada evento (y si su formulario tiene la sección);
 *    si unas ciudades pueden y otras no, dice que depende de la ciudad (sin nombrarlas);
 *  - no puedo asistir: siempre (que igual responda y cuente la razón);
 *  - cambiar la respuesta: según permitirEdicion (si los eventos no coinciden, no se muestra).
 */
export function preguntasFrecuentes(eventos: { formulario: Formulario; permitirEdicion: boolean; acompanante?: "si" | "no" }[]): PreguntaFrecuente[] {
  const lista: PreguntaFrecuente[] = [];
  const acompanante = respuestaAcompanante(eventos);
  if (acompanante) lista.push({ pregunta: "¿Puedo llevar un acompañante?", respuesta: acompanante });
  lista.push({
    pregunta: "¿Qué pasa si no puedo asistir?",
    respuesta: "Entra igual con tu documento y cuéntanos en el formulario que no podrás ir y por qué. Así organizamos mejor el evento.",
  });
  if (eventos.length && eventos.every((e) => !e.permitirEdicion)) {
    lista.push({ pregunta: "¿Puedo cambiar mi respuesta después de enviarla?", respuesta: "Después de enviarla no se puede cambiar. Si necesitas un cambio, escríbele a tu monitor." });
  } else if (eventos.length && eventos.every((e) => e.permitirEdicion)) {
    lista.push({ pregunta: "¿Puedo cambiar mi respuesta después de enviarla?", respuesta: "Sí. Mientras las confirmaciones sigan abiertas, entra de nuevo con tu documento y cámbiala." });
  }
  return lista;
}
