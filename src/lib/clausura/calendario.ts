// Calendario del evento: archivo .ics (RFC 5545) y enlace "Agregar a Google Calendar". Funciones puras.
// Fechas en UTC (sufijo Z): todos los calendarios las muestran en la hora local de quien lo abre, que en la ciudad
// del evento es la hora del evento. Líneas con CRLF, texto escapado y líneas largas plegadas a 75 bytes.
import type { Evento } from "./db";

type DatosCalendario = Pick<Evento, "slug" | "titulo" | "inicio" | "fin" | "lugar" | "direccion" | "nombreVisible" | "mapaUrl"> & Partial<Pick<Evento, "citacion" | "zonaHoraria">>;

/** El calendario empieza a la hora de citación (cuando deben llegar); si no hay, al inicio del evento. */
const comienzo = (e: DatosCalendario) => e.citacion ?? e.inicio;
const hora = (d: Date, tz = "America/Bogota") => d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz }).replace(/[\u00a0\u202f]/g, " ");

const DURACION_POR_DEFECTO_MS = 3 * 3600_000;
const finDe = (e: DatosCalendario) => e.fin ?? new Date(+e.inicio + DURACION_POR_DEFECTO_MS);

/** 2026-11-14T13:00:00.000Z → 20261114T130000Z */
export const fechaIcs = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapa \ ; , y saltos de línea (RFC 5545, 3.3.11). */
export const escaparIcs = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Pliega una línea en trozos de 75 bytes como máximo (sin partir caracteres UTF-8); las siguientes empiezan con un espacio. */
export function plegar(linea: string): string {
  const partes: string[] = [];
  let actual = "", bytes = 0;
  for (const ch of linea) {
    const b = Buffer.byteLength(ch);
    const limite = partes.length === 0 ? 75 : 74; // las de continuación llevan un espacio delante
    if (bytes + b > limite) { partes.push(actual); actual = ""; bytes = 0; }
    actual += ch;
    bytes += b;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const mapa = (e: DatosCalendario) => e.mapaUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.lugar}, ${e.direccion}, ${e.nombreVisible}`)}`;
const ubicacion = (e: DatosCalendario) => `${e.lugar}, ${e.direccion}, ${e.nombreVisible}`;
const descripcion = (e: DatosCalendario) => [
  `${e.titulo} · Jóvenes creaTIvos`,
  e.citacion ? `Llegada: ${hora(e.citacion, e.zonaHoraria)} · Inicio: ${hora(e.inicio, e.zonaHoraria)}` : `Inicio: ${hora(e.inicio, e.zonaHoraria)}`,
  `Lugar: ${e.lugar}, ${e.direccion} (${e.nombreVisible})`,
  `Cómo llegar: ${mapa(e)}`,
].join("\n");

export function generarIcs(e: DatosCalendario, ahora = new Date()): string {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fundacion ROFE//Jovenes creaTIvos//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.slug}@validacion.tocaunavida.org`,
    `DTSTAMP:${fechaIcs(ahora)}`,
    `DTSTART:${fechaIcs(comienzo(e))}`,
    `DTEND:${fechaIcs(finDe(e))}`,
    `SUMMARY:${escaparIcs(`${e.titulo} · Jóvenes creaTIvos`)}`,
    `LOCATION:${escaparIcs(ubicacion(e))}`,
    `DESCRIPTION:${escaparIcs(descripcion(e))}`,
    `URL:${mapa(e)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escaparIcs(e.titulo)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lineas.map(plegar).join("\r\n") + "\r\n";
}

/** Enlace "Agregar a Google Calendar" con título, fechas (UTC), lugar y descripción con el mapa. */
export function enlaceGoogle(e: DatosCalendario): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${e.titulo} · Jóvenes creaTIvos`,
    dates: `${fechaIcs(comienzo(e))}/${fechaIcs(finDe(e))}`,
    location: ubicacion(e),
    details: descripcion(e),
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
