// Datos de contacto del estudiante: ocultar correo y celular (lo único que ve el estudiante) y validar celulares.
// Funciones puras. Los indicativos y longitudes son los de src/lib/testimonios/celular.ts.
import { celularConIndicativo, paisDeCiudad } from "@/lib/testimonios/celular";

/** "juanita@gmail.com" → "ju•••••@gmail.com". Con 1–2 letras antes de la @, solo se muestra la primera. */
export function ocultarCorreo(correo: string | null | undefined): string {
  const c = String(correo ?? "").trim();
  const at = c.lastIndexOf("@");
  if (at < 1) return c ? "•••••" : "";
  const usuario = c.slice(0, at);
  const visible = usuario.length > 2 ? usuario.slice(0, 2) : usuario.slice(0, 1);
  return `${visible}•••••${c.slice(at)}`;
}

/** "3001112233" (Cali) → "300 ••• •• 33": tres primeros y dos últimos dígitos del número nacional. */
export function ocultarCelular(celular: string | null | undefined, ciudad: string | null | undefined): string {
  const formateado = celularConIndicativo(celular, ciudad);
  if (!formateado) return "";
  const nacional = formateado.replace(/^\+\d+\s/, "").replace(/\D/g, "");
  if (nacional.length < 6) return "•••";
  return `${nacional.slice(0, 3)} ••• •• ${nacional.slice(-2)}`;
}

// Países conocidos (se toman de celular.ts por una ciudad representativa de cada uno).
const PAISES = ["cali", "panama", "quito", "uruguay"].map((c) => paisDeCiudad(c)!).filter(Boolean);

/**
 * Valida un celular escrito por el estudiante. Acepta espacios, guiones, paréntesis, + y 00.
 * - Con indicativo conocido (+57, +507, +593, +598): el resto debe tener la longitud de ese país (se tolera el 0 inicial).
 * - Sin indicativo y ciudad conocida: la longitud nacional de ese país.
 * - Sin indicativo y ciudad desconocida: entre 7 y 15 dígitos.
 * Devuelve los dígitos tal como se guardan (con el indicativo si lo escribió).
 */
export function validarTelefono(texto: string, ciudad: string | null): { ok: true; digitos: string } | { ok: false } {
  if (/[^\d\s+().-]/.test(texto)) return { ok: false };
  let d = texto.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 7 || d.length > 15) return { ok: false };
  const sinPrefijo = d.slice(-7);
  if (/^(\d)\1+$/.test(sinPrefijo)) return { ok: false }; // 3000000000, 1111111…
  const propio = paisDeCiudad(ciudad);
  const conIndicativo = texto.trim().startsWith("+") || texto.trim().startsWith("00");
  for (const p of propio ? [propio, ...PAISES.filter((x) => x.cc !== propio.cc)] : PAISES) {
    if (!d.startsWith(p.cc)) continue;
    const resto = d.slice(p.cc.length).replace(/^0/, "");
    if (resto.length === p.nacional) return { ok: true, digitos: d };
  }
  if (conIndicativo) return d.length >= 8 ? { ok: true, digitos: d } : { ok: false };
  if (propio) return d.replace(/^0/, "").length === propio.nacional ? { ok: true, digitos: d } : { ok: false };
  return { ok: true, digitos: d };
}

/** "Tu género" (del estudiante). Aquí y no en db.ts: lo usa también el navegador. */
export const GENEROS = { masculino: "Masculino", femenino: "Femenino", no_binario: "No binario" } as const;
export type Genero = keyof typeof GENEROS;
