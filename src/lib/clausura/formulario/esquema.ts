// Esquema del formulario de un evento de clausura (es el mismo formato de los JSON de eventos/ y del futuro editor).
// Los IDs (secciones, preguntas, bloques y opciones) son ESTABLES: se escriben una vez y nunca cambian, aunque se
// edite el texto. Las respuestas, las condiciones y el Excel se apoyan en ellos.
import { z } from "zod";

export const ID = z.string().regex(/^[a-z0-9_]{1,40}$/, "Los IDs usan solo minúsculas, números y _ (máximo 40)");

export const TIPOS_PREGUNTA = ["texto", "parrafo", "unica", "casillas", "desplegable", "sino", "numero", "fecha", "telefono"] as const;
export type TipoPregunta = (typeof TIPOS_PREGUNTA)[number];
/** Tipos con lista de opciones. */
export const CON_OPCIONES: readonly TipoPregunta[] = ["unica", "casillas", "desplegable"];
/** Tipos cuyas opciones pueden llevar salto ("ir a"), como en Google Forms. */
export const CON_SALTO: readonly TipoPregunta[] = ["unica", "desplegable"];

/** A dónde ir después: la siguiente sección, una sección concreta o directo a enviar. */
export const Destino = z.union([z.literal("siguiente"), z.literal("enviar"), z.object({ seccion: ID }).strict()]);
export type Destino = z.infer<typeof Destino>;

/**
 * Condición "mostrar solo si". valor: id de opción (unica, desplegable, casillas), "si" / "no" (sino), número o texto.
 *  "="       → la respuesta es ese valor (en casillas: la opción está marcada)
 *  "!="      → la respuesta NO es ese valor (también se cumple si no respondió)
 *  "incluye" → casillas: la opción está marcada · texto/párrafo: contiene el texto (sin distinguir mayúsculas ni tildes)
 */
export const Condicion = z.object({
  pregunta: ID,
  op: z.enum(["=", "!=", "incluye"]),
  valor: z.union([z.string().max(200), z.number()]),
}).strict();
export type Condicion = z.infer<typeof Condicion>;
/** Una condición o varias (se deben cumplir todas). */
export const MostrarSi = z.union([Condicion, z.array(Condicion).min(1).max(10)]);
export type MostrarSi = z.infer<typeof MostrarSi>;

export const Opcion = z.object({
  id: ID,
  texto: z.string().min(1).max(200),
  irA: Destino.optional(),
  /** Opción "Otro": al elegirla se pide un texto obligatorio ("Otro: ¿cuál?"). Solo en opción única y desplegable. */
  otro: z.boolean().optional(),
  archivada: z.boolean().optional(),
}).strict();
export type Opcion = z.infer<typeof Opcion>;

export const Pregunta = z.object({
  id: ID,
  tipo: z.enum(TIPOS_PREGUNTA),
  titulo: z.string().min(1).max(300),
  ayuda: z.string().max(1000).optional(),
  obligatoria: z.boolean().default(false),
  opciones: z.array(Opcion).max(60).optional(),
  /** numero: valor mínimo y máximo · casillas: cuántas marcar como mínimo y máximo. */
  min: z.number().optional(),
  max: z.number().optional(),
  /** numero: solo enteros. */
  entero: z.boolean().optional(),
  /**
   * texto: "nombre" (nombre de persona: solo letras, mínimo dos palabras; se guarda con mayúsculas iniciales),
   * "documento" (solo números, 6 a 10 dígitos; se guarda sin puntos ni espacios) o "url" (enlace http/https).
   */
  formato: z.enum(["nombre", "documento", "url"]).optional(),
  mostrarSi: MostrarSi.optional(),
  archivada: z.boolean().optional(),
}).strict();
export type Pregunta = z.infer<typeof Pregunta>;

/** Bloque informativo: texto con formato básico y/o imagen. No es pregunta. */
export const Bloque = z.object({
  id: ID,
  tipo: z.literal("info"),
  titulo: z.string().max(300).optional(),
  texto: z.string().max(5000).optional(),
  imagen: z.string().regex(/^\/[A-Za-z0-9/_.-]+$/, "La imagen es una ruta del sitio, p. ej. /clausura/mapa.webp").optional(),
  mostrarSi: MostrarSi.optional(),
  archivada: z.boolean().optional(),
}).strict();
export type Bloque = z.infer<typeof Bloque>;

export const Item = z.union([Bloque, Pregunta]);
export type Item = Pregunta | Bloque;
export const esPregunta = (i: Item): i is Pregunta => i.tipo !== "info";

export const Seccion = z.object({
  id: ID,
  titulo: z.string().min(1).max(200),
  descripcion: z.string().max(3000).optional(),
  items: z.array(Item).max(80),
  /** Después de esta sección (si ninguna opción con salto decide otra cosa). Por defecto, la siguiente. */
  despues: Destino.optional(),
  mostrarSi: MostrarSi.optional(),
  archivada: z.boolean().optional(),
  /** Marca la sección del proyecto: aparece o no según el campo "proyecto" del evento (obligatorio / opcional / no). */
  proyecto: z.boolean().optional(),
}).strict();
export type Seccion = z.infer<typeof Seccion>;

export const Formulario = z.object({ secciones: z.array(Seccion).min(1).max(40) }).strict();
export type Formulario = z.infer<typeof Formulario>;

/** Valor guardado de una respuesta: texto, número, "si"/"no", id de opción, lista de ids (casillas) o fecha AAAA-MM-DD. */
export type Valor = string | number | string[];

/** Clave donde se guarda el texto de "Otro: ¿cuál?" de una pregunta (los IDs no llevan ":", así que no choca). */
export const claveOtro = (preguntaId: string) => `${preguntaId}:otro`;
export const MAX_OTRO = 200;
export type Respuestas = Record<string, Valor>;
