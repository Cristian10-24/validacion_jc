import { ciudadExistente, cleanSpaces, normalizeCity } from "@/lib/validation/name";

// Catálogo FIJO de ciudades del programa (decisión: no se lee la colección students).
export const CIUDADES = [
  "Barranquilla",
  "Bogotá D.C.",
  "Cali",
  "Cartagena",
  "Ciudad de Panamá",
  "Guayaquil",
  "Medellín",
  "Quito",
  "Uruguay",
] as const;

/** Textos que se guardan como otra ciudad del catálogo (clave: minúsculas, sin tildes ni signos). */
const ALIAS: Record<string, (typeof CIUDADES)[number]> = {
  paysandu: "Uruguay",
  colonia: "Uruguay",
};

const clave = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type CiudadResuelta = {
  /** Ciudad del catálogo, o null si el texto no corresponde a ninguna. */
  ciudad: string | null;
  /** Texto original cuando se usó un alias (p. ej. "Paysandú" → Uruguay), para mostrarlo en el detalle. */
  ciudadOriginal: string | null;
};

/** Resuelve el texto de ciudad contra el catálogo: tolera tildes, mayúsculas y puntos, y aplica los alias. */
export function resolverCiudad(texto: string | null | undefined): CiudadResuelta {
  const original = cleanSpaces(String(texto ?? ""));
  if (!original) return { ciudad: null, ciudadOriginal: null };
  const alias = ALIAS[clave(original)];
  if (alias) return { ciudad: alias, ciudadOriginal: original };
  const c = ciudadExistente(normalizeCity(original), [...CIUDADES]);
  return { ciudad: (CIUDADES as readonly string[]).includes(c) ? c : null, ciudadOriginal: null };
}

/** Ciudad del catálogo que corresponde al texto, o null si no existe. */
export function ciudadDelCatalogo(texto: string): string | null {
  return resolverCiudad(texto).ciudad;
}
