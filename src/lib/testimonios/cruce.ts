// Normalización y cruce de respuestas del Google Form con la lista de participantes.
// Funciones puras (sin base de datos): las usan el webhook, la importación y las pruebas.
import { createHash } from "node:crypto";
import { headerKey } from "@/lib/excel";
import { normalizeEmail } from "@/lib/validation/email";
import { cleanSpaces, normalizeDocumento, toProperName } from "@/lib/validation/name";
import { resolverCiudad } from "./ciudades";

// ---------- Celular ----------

/** Indicativos de país del programa y longitud del número nacional que queda al quitarlos. */
const INDICATIVOS: { cc: string; nacional: number[] }[] = [
  { cc: "507", nacional: [7, 8] }, // Panamá
  { cc: "598", nacional: [8, 9] }, // Uruguay
  { cc: "593", nacional: [9] },    // Ecuador
  { cc: "57", nacional: [10] },    // Colombia
];

/**
 * Clave de celular para comparar: solo dígitos, sin indicativo de país (+57, +507, +598, +593)
 * ni el 0 inicial de marcación nacional, y como máximo los últimos 10 dígitos.
 * Así "+507 6123-4567" y "6123 4567" dan lo mismo, y para Colombia equivale a "los últimos 10".
 * Devuelve null si quedan menos de 7 dígitos (no sirve para cruzar).
 */
export function claveCelular(valor: string | null | undefined): string | null {
  let d = String(valor ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2); // marcación internacional 00…
  for (const { cc, nacional } of INDICATIVOS) {
    if (d.startsWith(cc)) {
      const resto = d.slice(cc.length).replace(/^0/, "");
      if (nacional.includes(resto.length)) { d = resto; break; }
    }
  }
  if (d.length >= 8 && d.length <= 10 && d.startsWith("0")) d = d.slice(1); // 0 de marcación nacional (Ecuador, Uruguay)
  d = d.slice(-10);
  return d.length >= 7 ? d : null;
}

// ---------- Correo, documento, enlaces ----------

export function claveCorreo(valor: string | null | undefined): string | null {
  const c = normalizeEmail(String(valor ?? ""));
  return c.includes("@") ? c : null;
}

export function claveDocumento(valor: string | null | undefined): string | null {
  const d = normalizeDocumento(String(valor ?? ""));
  return d.length >= 3 ? d : null;
}

/** Enlaces del video: la celda puede traer varios separados por comas, espacios o saltos de línea. */
export function separarEnlaces(valor: string | null | undefined): string[] {
  const texto = String(valor ?? "").trim();
  if (!texto) return [];
  const partes = texto.split(/[\s,;]+/).map((p) => p.trim()).filter(Boolean);
  const urls = partes.filter((p) => /^https?:\/\//i.test(p));
  return [...new Set(urls.length ? urls : [texto])];
}

// ---------- Respuesta del formulario ----------

export type RespuestaNorm = {
  marcaTemporal: string;
  nombre: string;
  documento: string | null;
  correo: string | null;
  celular: string | null;
  /** Ciudad del catálogo; si no se reconoce, el texto tal como vino. */
  ciudad: string;
  /** Texto original cuando se aplicó un alias (p. ej. "Paysandú" → Uruguay). */
  ciudadOriginal: string | null;
  enlaces: string[];
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
 * Normaliza una respuesta tal como llega del Sheet. Columnas esperadas:
 * Marca temporal | Nombre Completo | Número de documento | Correo | Número de WhatsApp o Celular |
 * Ciudad a la que perteneces | ¡Sube aquí tu testimonio!
 */
export function normalizarRespuesta(original: Record<string, unknown>): RespuestaNorm {
  const ciudadTexto = cleanSpaces(campo(original, ["ciudad"]));
  const ciudad = resolverCiudad(ciudadTexto);
  return {
    marcaTemporal: campo(original, ["marca", "temporal"], ["timestamp"], ["fecha"]),
    nombre: toProperName(cleanSpaces(campo(original, ["nombre"]))),
    documento: claveDocumento(campo(original, ["documento"], ["cedula"], ["identificacion"])),
    correo: claveCorreo(campo(original, ["correo"], ["email"], ["e", "mail"])),
    celular: claveCelular(campo(original, ["whatsapp"], ["celular"], ["telefono"], ["movil"])),
    ciudad: ciudad.ciudad ?? ciudadTexto,
    ciudadOriginal: ciudad.ciudadOriginal,
    enlaces: separarEnlaces(campo(original, ["testimonio"], ["video"], ["enlace"], ["sube"])),
  };
}

/**
 * Clave de idempotencia: la misma respuesta enviada dos veces produce la misma clave.
 * Se basa en el contenido (no en el número de fila, que cambia si borran una fila).
 */
export function claveRespuesta(r: RespuestaNorm): string {
  const base = [r.marcaTemporal, r.documento ?? "", r.correo ?? "", r.celular ?? "", [...r.enlaces].sort().join(" ")].join("|");
  return createHash("sha256").update(base).digest("hex");
}

// ---------- Cruce ----------

export type ParticipanteClaves = { id: string; documento: string | null; correo: string | null; celular: string | null };

export type Indice = { porDocumento: Map<string, Set<string>>; porCorreo: Map<string, Set<string>>; porCelular: Map<string, Set<string>> };

function agregar(m: Map<string, Set<string>>, k: string | null, id: string) {
  if (!k) return;
  const s = m.get(k) ?? new Set<string>();
  s.add(id);
  m.set(k, s);
}

export function construirIndice(participantes: ParticipanteClaves[]): Indice {
  const ix: Indice = { porDocumento: new Map(), porCorreo: new Map(), porCelular: new Map() };
  for (const p of participantes) {
    agregar(ix.porDocumento, p.documento, p.id);
    agregar(ix.porCorreo, p.correo, p.id);
    agregar(ix.porCelular, p.celular, p.id);
  }
  return ix;
}

export type DatoCruce = "documento" | "correo" | "celular";

export type ResultadoCruce =
  | { cruce: "auto"; participanteId: string; por: DatoCruce } // por: el dato que decidió el cruce (se muestra en el panel)
  | { cruce: "sin_duenio" }
  | { cruce: "conflicto"; candidatos: string[] };

/**
 * Cruce de una respuesta con la lista de participantes. El nombre NO se usa.
 *  1. Gana el documento: si coincide con un único participante, la respuesta es suya aunque el correo
 *     o el celular coincidan con otra persona (p. ej. hermanos que comparten correo).
 *  2. Solo si el documento no coincide con nadie (o no vino), se cruza por correo o celular:
 *     - un único participante → es suya (por correo, o por celular si el correo no coincidió);
 *     - participantes distintos → conflicto;
 *     - nadie → sin dueño.
 */
export function cruzar(r: Pick<RespuestaNorm, "documento" | "correo" | "celular">, ix: Indice): ResultadoCruce {
  const porDoc = r.documento ? ix.porDocumento.get(r.documento) : undefined;
  if (porDoc?.size === 1) return { cruce: "auto", participanteId: [...porDoc][0], por: "documento" };
  if (porDoc && porDoc.size > 1) return { cruce: "conflicto", candidatos: [...porDoc].sort() }; // no debería pasar: documento único

  const porCorreo = r.correo ? ix.porCorreo.get(r.correo) ?? new Set<string>() : new Set<string>();
  const porCelular = r.celular ? ix.porCelular.get(r.celular) ?? new Set<string>() : new Set<string>();
  const candidatos = new Set([...porCorreo, ...porCelular]);
  if (candidatos.size === 0) return { cruce: "sin_duenio" };
  if (candidatos.size > 1) return { cruce: "conflicto", candidatos: [...candidatos].sort() };
  const id = [...candidatos][0];
  return { cruce: "auto", participanteId: id, por: porCorreo.has(id) ? "correo" : "celular" };
}
