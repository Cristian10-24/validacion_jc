// Reglas para que los textos libres tengan sentido (sin "ffddgdffg", "aaaa" ni solo signos). Funciones puras:
// las usan el servidor (Zod) y el navegador (mensajes debajo de cada campo).

const VOCAL = /[aeiouáéíóúü]/i;
const LETRAS = /[a-záéíóúüñ]+/gi;

/**
 * Texto "basura": sin letras, una palabra de 5+ letras sin vocales, 5+ consonantes seguidas o un carácter repetido
 * 4+ veces. Siglas cortas sin vocales (TIC, CNC, HTML) y nombres como SENA o UdeA son válidos.
 */
export function esBasura(t: string): boolean {
  const palabras = t.match(LETRAS) ?? [];
  if (!palabras.length) return true;
  if (/(.)\1{3,}/iu.test(t.replace(/\s/g, ""))) return true;
  if (palabras.some((p) => p.length >= 5 && !VOCAL.test(p))) return true;
  if (palabras.some((p) => /[bcdfghjklmnñpqrstvwxyz]{5,}/i.test(p))) return true;
  return false;
}

/** Texto libre con sentido y un mínimo de caracteres (sin contar espacios de sobra). */
export function textoConSentido(t: string, min: number): boolean {
  const limpio = t.replace(/\s+/g, " ").trim();
  return limpio.length >= min && !esBasura(limpio);
}

const PALABRA_NOMBRE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:[-'’][A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)*$/;

/**
 * Nombre de persona: letras (con tildes y ñ), espacios, guion y apóstrofo dentro de la palabra ("María-José",
 * "D'Angelo"); mínimo dos palabras de 2+ letras, sin basura.
 */
export function nombreValido(t: string): boolean {
  const limpio = t.replace(/\s+/g, " ").trim();
  const palabras = limpio.split(" ");
  if (palabras.length < 2 || !palabras.every((p) => PALABRA_NOMBRE.test(p))) return false;
  return palabras.every((p) => p.replace(/[-'’]/g, "").length >= 2) && !esBasura(limpio) && palabras.every((p) => VOCAL.test(p) || p.length <= 3);
}

/** Documento de identidad: solo números (se quitan puntos, espacios y guiones), entre 6 y 10 dígitos. */
export function documentoNumerico(t: string): string | null {
  if (!/^[\d.\s-]+$/.test(t.trim())) return null;
  const d = t.replace(/\D/g, "");
  return d.length >= 6 && d.length <= 10 && !/^(\d)\1+$/.test(d) ? d : null;
}

export const MIN_TEXTO = 2;
export const MIN_PARRAFO = 10;
export const MIN_OTRO = 3;
