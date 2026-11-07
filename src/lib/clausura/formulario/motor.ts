// Motor del formulario: camino visible (saltos y "mostrar solo si"), validación con Zod generada desde el esquema,
// limpieza de respuestas de ramas ocultas y reglas para editar un formulario que ya tiene respuestas.
// Funciones PURAS: las usan el servidor (que siempre recalcula) y el navegador (solo para la experiencia).
import { z } from "zod";
import { toProperName } from "@/lib/validation/name";
import { documentoNumerico, MIN_OTRO, MIN_PARRAFO, MIN_TEXTO, nombreValido, textoConSentido } from "./textos";
import { validarTelefono } from "../contacto";
import {
  claveOtro, CON_OPCIONES, CON_SALTO, esPregunta, MAX_OTRO,
  type Condicion, type Destino, type Formulario, type Item, type MostrarSi, type Pregunta, type Respuestas, type Seccion, type Valor,
} from "./esquema";

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Sin respuesta: undefined, null, texto vacío o en blanco, o lista vacía. */
export function vacio(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
}

export function preguntasDe(f: Formulario): Map<string, Pregunta> {
  const m = new Map<string, Pregunta>();
  for (const s of f.secciones) for (const i of s.items) if (esPregunta(i)) m.set(i.id, i);
  return m;
}

function cumpleUna(c: Condicion, vig: Respuestas, preguntas: Map<string, Pregunta>): boolean {
  const v = vig[c.pregunta];
  const p = preguntas.get(c.pregunta);
  if (c.op === "incluye") {
    if (vacio(v)) return false;
    return Array.isArray(v) ? v.includes(String(c.valor)) : fold(String(v)).includes(fold(String(c.valor)));
  }
  let igual: boolean;
  if (vacio(v)) igual = false;
  else if (Array.isArray(v)) igual = v.includes(String(c.valor));
  else if (p?.tipo === "numero" || typeof v === "number") igual = Number(v) === Number(c.valor);
  else igual = fold(String(v)) === fold(String(c.valor));
  return c.op === "=" ? igual : !igual;
}

export function cumple(m: MostrarSi | undefined, vig: Respuestas, preguntas: Map<string, Pregunta>): boolean {
  if (!m) return true;
  return (Array.isArray(m) ? m : [m]).every((c) => cumpleUna(c, vig, preguntas));
}

export type Paso = { seccion: Seccion; items: Item[] };
export type Camino = {
  /** Secciones que el estudiante recorre, en orden, con sus preguntas y bloques visibles. */
  pasos: Paso[];
  /** Respuestas de las preguntas visibles del camino (lo demás se descarta). */
  vigentes: Respuestas;
};

/** Destino al terminar una sección: la última pregunta con saltos que esté respondida decide; si no, "despues". */
function destinoDe(s: Seccion, visibles: Item[], vig: Respuestas): Destino {
  for (let k = visibles.length - 1; k >= 0; k--) {
    const it = visibles[k]!;
    if (!esPregunta(it) || !CON_SALTO.includes(it.tipo) || !it.opciones?.some((o) => o.irA)) continue;
    const elegida = it.opciones.find((o) => o.id === vig[it.id]);
    if (elegida?.irA) return elegida.irA;
    break; // sin responder o la opción no tiene salto: decide la sección
  }
  return s.despues ?? "siguiente";
}

/** Recorre el formulario con las respuestas dadas. Nunca visita una sección dos veces y solo salta hacia adelante. */
export function camino(f: Formulario, r: Respuestas): Camino {
  const preguntas = preguntasDe(f);
  const vig: Respuestas = {};
  const pasos: Paso[] = [];
  let i = 0;
  while (i < f.secciones.length) {
    const s = f.secciones[i]!;
    if (s.archivada || !cumple(s.mostrarSi, vig, preguntas)) { i++; continue; }
    const items: Item[] = [];
    for (const it of s.items) {
      if (it.archivada || !cumple(it.mostrarSi, vig, preguntas)) continue;
      items.push(it);
      if (esPregunta(it) && !vacio(r[it.id])) {
        vig[it.id] = limpiarValor(r[it.id]!);
        const k = claveOtro(it.id);
        if (eligioOtro(it, vig[it.id]) && !vacio(r[k])) vig[k] = limpiarValor(r[k]!);
      }
    }
    pasos.push({ seccion: s, items });
    const d = destinoDe(s, items, vig);
    if (d === "enviar") break;
    if (d !== "siguiente") {
      const j = f.secciones.findIndex((x) => x.id === d.seccion);
      if (j > i) { i = j; continue; }
    }
    i++;
  }
  return { pasos, vigentes: vig };
}

/** ¿La respuesta es la opción "Otro" de esa pregunta? */
export function eligioOtro(p: Pregunta, v: Valor | undefined): boolean {
  return v !== undefined && !!p.opciones?.some((o) => o.otro && o.id === v);
}

function limpiarValor(v: Valor): Valor {
  return typeof v === "string" ? v.trim() : v;
}

/** Respuestas sin las de preguntas ocultas, archivadas, desconocidas o fuera del camino. */
export function limpiar(f: Formulario, r: Respuestas): Respuestas {
  return camino(f, r).vigentes;
}

/** Id de la sección que sigue a `seccionId` en el camino, o null si después va el resumen. */
export function siguienteSeccion(f: Formulario, r: Respuestas, seccionId: string): string | null {
  const ids = camino(f, r).pasos.map((p) => p.seccion.id);
  const k = ids.indexOf(seccionId);
  return k >= 0 && k + 1 < ids.length ? ids[k + 1]! : null;
}

// ---------- Validación con Zod generada desde el esquema ----------

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (t: string) => FECHA.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().startsWith(t);

/** Mensaje para el estudiante cuando la respuesta no sirve. */
export function mensajePara(p: Pregunta): string {
  switch (p.tipo) {
    case "texto":
      if (p.formato === "nombre") return "Escribe nombre y apellido, solo con letras (mínimo dos palabras de 2 letras).";
      if (p.formato === "documento") return "Escribe solo números, entre 6 y 10 dígitos (sin puntos ni espacios).";
      if (p.formato === "url") return "Escribe un enlace completo, por ejemplo https://…";
      return "Escribe una respuesta real, con palabras (mínimo 2 letras, hasta 300 caracteres).";
    case "parrafo": return `Cuéntanos un poco más, con palabras reales (mínimo ${MIN_PARRAFO} caracteres).`;
    case "unica": case "desplegable": case "sino": return "Elige una opción.";
    case "casillas": {
      const min = Math.max(p.min ?? 0, p.obligatoria ? 1 : 0);
      if (p.max !== undefined && min > 0) return `Marca entre ${min} y ${p.max} opciones.`;
      if (p.max !== undefined) return `Marca máximo ${p.max} opciones.`;
      return min > 1 ? `Marca al menos ${min} opciones.` : "Marca al menos una opción.";
    }
    case "numero": {
      const base = p.entero ? "Escribe un número entero" : "Escribe un número";
      if (p.min !== undefined && p.max !== undefined) return `${base} entre ${p.min} y ${p.max}.`;
      if (p.min !== undefined) return `${base} desde ${p.min}.`;
      if (p.max !== undefined) return `${base} hasta ${p.max}.`;
      return `${base}.`;
    }
    case "fecha": return "Elige una fecha válida.";
    case "telefono": return "Escribe un número de celular válido.";
  }
}

/** Esquema Zod de una sola pregunta (el valor ya viene sin vacíos: obligatoria = la clave debe existir). */
export function zPregunta(p: Pregunta): z.ZodType {
  let t: z.ZodType;
  const ids = (p.opciones ?? []).map((o) => o.id) as [string, ...string[]];
  switch (p.tipo) {
    case "texto":
      if (p.formato === "documento") t = z.preprocess((v) => (typeof v === "string" ? documentoNumerico(v) ?? v : v), z.string().regex(/^\d{6,10}$/));
      else if (p.formato === "nombre") t = z.string().max(120).refine(nombreValido).transform((x) => toProperName(x.replace(/\s+/g, " ").trim()));
      else if (p.formato === "url") t = z.string().trim().max(300).refine((x) => { try { const u = new URL(x); return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes("."); } catch { return false; } });
      else t = z.string().trim().max(300).refine((x) => textoConSentido(x, MIN_TEXTO));
      break;
    case "parrafo": t = z.string().trim().max(3000).refine((x) => textoConSentido(x, MIN_PARRAFO)); break;
    case "unica": case "desplegable": t = ids.length ? z.enum(ids) : z.never(); break;
    case "sino": t = z.enum(["si", "no"]); break;
    case "casillas": {
      const min = Math.max(p.min ?? 0, p.obligatoria ? 1 : 0, 1);
      let a = z.array(ids.length ? z.enum(ids) : z.never()).min(min);
      if (p.max !== undefined) a = a.max(p.max);
      t = a.refine((x) => new Set(x).size === x.length);
      break;
    }
    case "numero": {
      let n = z.number().finite();
      if (p.entero) n = n.int();
      if (p.min !== undefined) n = n.min(p.min);
      if (p.max !== undefined) n = n.max(p.max);
      t = z.preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : v), n);
      break;
    }
    case "fecha": t = z.string().refine(fechaValida); break;
    case "telefono": t = z.string().max(30).refine((x) => validarTelefono(x, null).ok); break;
  }
  return p.obligatoria ? t : t.optional();
}

/** z.object estricto con las preguntas dadas (las visibles de una sección o de todo el camino). */
export function esquemaZod(preguntas: Pregunta[]) {
  return z.object(Object.fromEntries(preguntas.map((p) => [p.id, zPregunta(p)]))).strict();
}

export type Validacion =
  | { ok: true; respuestas: Respuestas }
  | { ok: false; errores: Record<string, string>; respuestas: Respuestas };

/**
 * Limpia las respuestas (descarta ramas ocultas) y valida con Zod:
 *  - con `seccionId`: solo las preguntas visibles de esa sección (que debe estar en el camino);
 *  - sin `seccionId`: todas las preguntas visibles del camino (para enviar).
 * Devuelve siempre las respuestas limpias (es lo que se guarda).
 */
export function validarRespuestas(f: Formulario, r: Respuestas, seccionId?: string): Validacion {
  const { pasos, vigentes } = camino(f, r);
  const pasosAValidar = seccionId ? pasos.filter((p) => p.seccion.id === seccionId) : pasos;
  if (seccionId && pasosAValidar.length === 0) return { ok: false, errores: { _seccion: "Esta sección no aplica según tus respuestas." }, respuestas: vigentes };
  const preguntas = pasosAValidar.flatMap((p) => p.items.filter(esPregunta));
  const datos: Record<string, unknown> = Object.fromEntries(preguntas.filter((p) => p.id in vigentes).map((p) => [p.id, vigentes[p.id]]));
  // "Otro: ¿cuál?": si eligió la opción "Otro", el texto es obligatorio.
  const conOtro = preguntas.filter((p) => eligioOtro(p, vigentes[p.id]));
  for (const p of conOtro) if (claveOtro(p.id) in vigentes) datos[claveOtro(p.id)] = vigentes[claveOtro(p.id)];
  const res = esquemaZod(preguntas).extend(Object.fromEntries(conOtro.map((p) => [claveOtro(p.id), z.string().trim().max(MAX_OTRO).refine((x) => textoConSentido(x, MIN_OTRO))]))).safeParse(datos);
  if (res.success) return { ok: true, respuestas: { ...vigentes, ...(res.data as Respuestas) } };
  const porId = new Map(preguntas.map((p) => [p.id, p]));
  const errores: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const id = String(issue.path[0] ?? "");
    if (id.endsWith(":otro")) { errores[id] ??= id in datos ? `Escribe cuál, con palabras reales (mínimo ${MIN_OTRO} letras).` : "Escribe cuál."; continue; }
    const p = porId.get(id);
    if (!p || errores[id]) continue;
    errores[id] = id in datos ? mensajePara(p) : "Esta pregunta es obligatoria.";
  }
  return { ok: false, errores, respuestas: vigentes };
}

// ---------- Reglas de estructura (al cargar o editar un formulario) ----------

const seccionDestino = (d: Destino | undefined) => (d && typeof d === "object" ? d.seccion : null);

/** Revisa que el formulario sea coherente. Devuelve la lista de problemas (vacía = está bien). */
export function validarFormulario(f: Formulario): string[] {
  const errores: string[] = [];
  const pos = new Map<string, { s: number; i: number; tipo: string }>();
  const indiceSeccion = new Map(f.secciones.map((s, k) => [s.id, k]));
  const preguntas = preguntasDe(f);

  f.secciones.forEach((s, si) => {
    if (pos.has(s.id)) errores.push(`ID repetido: "${s.id}"`);
    pos.set(s.id, { s: si, i: -1, tipo: "seccion" });
    s.items.forEach((it, ii) => {
      if (pos.has(it.id)) errores.push(`ID repetido: "${it.id}"`);
      pos.set(it.id, { s: si, i: ii, tipo: it.tipo });
    });
  });

  const revisarDestino = (d: Destino | undefined, si: number, donde: string) => {
    const id = seccionDestino(d);
    if (!id) return;
    const j = indiceSeccion.get(id);
    if (j === undefined) errores.push(`${donde}: la sección "${id}" no existe`);
    else if (j <= si) errores.push(`${donde}: solo se puede saltar a una sección posterior ("${id}" está antes o es la misma)`);
  };

  const revisarCondicion = (m: MostrarSi | undefined, si: number, ii: number, donde: string) => {
    if (!m) return;
    for (const c of Array.isArray(m) ? m : [m]) {
      const p = preguntas.get(c.pregunta);
      const at = pos.get(c.pregunta);
      if (!p || !at) { errores.push(`${donde}: la condición usa la pregunta "${c.pregunta}", que no existe`); continue; }
      const antes = at.s < si || (at.s === si && ii >= 0 && at.i < ii);
      if (!antes) errores.push(`${donde}: la condición usa "${c.pregunta}", que debe estar antes`);
      if (c.op === "incluye" && !["casillas", "texto", "parrafo"].includes(p.tipo)) errores.push(`${donde}: "incluye" solo sirve con casillas, texto o párrafo`);
      if (CON_OPCIONES.includes(p.tipo) && !p.opciones?.some((o) => o.id === String(c.valor))) errores.push(`${donde}: "${c.valor}" no es una opción de "${c.pregunta}"`);
      if (p.tipo === "sino" && !["si", "no"].includes(String(c.valor))) errores.push(`${donde}: en una pregunta sí/no el valor es "si" o "no"`);
      if (p.tipo === "numero" && !Number.isFinite(Number(c.valor))) errores.push(`${donde}: el valor debe ser un número`);
    }
  };

  f.secciones.forEach((s, si) => {
    revisarDestino(s.despues, si, `Sección "${s.id}"`);
    revisarCondicion(s.mostrarSi, si, -1, `Sección "${s.id}"`);
    s.items.forEach((it, ii) => {
      const donde = `"${it.id}"`;
      revisarCondicion(it.mostrarSi, si, ii, donde);
      if (!esPregunta(it)) {
        if (!it.texto && !it.imagen) errores.push(`${donde}: un bloque informativo necesita texto o imagen`);
        return;
      }
      const conOpciones = CON_OPCIONES.includes(it.tipo);
      if (conOpciones && !it.opciones?.some((o) => !o.archivada)) errores.push(`${donde}: necesita al menos una opción`);
      if (!conOpciones && it.opciones) errores.push(`${donde}: una pregunta de tipo "${it.tipo}" no lleva opciones`);
      if (it.formato && it.tipo !== "texto") errores.push(`${donde}: "formato" solo aplica a preguntas de texto`);
      if (it.opciones?.some((o) => o.otro) && !CON_SALTO.includes(it.tipo)) errores.push(`${donde}: la opción "Otro" solo va en opción única o desplegable`);
      if ((it.opciones ?? []).filter((o) => o.otro).length > 1) errores.push(`${donde}: solo puede haber una opción "Otro"`);
      const ids = new Set<string>();
      for (const o of it.opciones ?? []) {
        if (ids.has(o.id)) errores.push(`${donde}: opción repetida "${o.id}"`);
        ids.add(o.id);
        if (o.irA && !CON_SALTO.includes(it.tipo)) errores.push(`${donde}: solo las preguntas de opción única o desplegable llevan saltos`);
        revisarDestino(o.irA, si, `${donde}, opción "${o.id}"`);
      }
      if ((it.min !== undefined || it.max !== undefined || it.entero) && !["numero", "casillas"].includes(it.tipo)) errores.push(`${donde}: mín/máx solo aplican a número o casillas`);
      if (it.min !== undefined && it.max !== undefined && it.min > it.max) errores.push(`${donde}: el mínimo es mayor que el máximo`);
    });
  });
  return errores;
}

/** Preguntas y opciones que ya tienen respuestas: id de pregunta → ids de opción usados (o vacío si no es de opciones). */
export type Usados = Map<string, Set<string>>;

export function usadosEn(lista: Respuestas[]): Usados {
  const u: Usados = new Map();
  for (const r of lista) {
    for (const [id, v] of Object.entries(r)) {
      if (vacio(v)) continue;
      const s = u.get(id) ?? new Set<string>();
      for (const x of Array.isArray(v) ? v : [v]) s.add(String(x));
      u.set(id, s);
    }
  }
  return u;
}

/**
 * Cambios permitidos en un formulario con respuestas: textos, preguntas nuevas, archivar.
 * No se permite: borrar una pregunta u opción con respuestas, ni cambiar el tipo de una pregunta con respuestas.
 */
export function validarCambioFormulario(viejo: Formulario, nuevo: Formulario, usados: Usados): string[] {
  const errores: string[] = [];
  const antes = preguntasDe(viejo), despues = preguntasDe(nuevo);
  for (const [id, valores] of usados) {
    const a = antes.get(id), d = despues.get(id);
    if (!a) continue;
    if (!d) { errores.push(`La pregunta "${id}" ya tiene respuestas: no se puede borrar (archívala con "archivada": true)`); continue; }
    if (a.tipo !== d.tipo) { errores.push(`La pregunta "${id}" ya tiene respuestas: no se puede cambiar su tipo (${a.tipo} → ${d.tipo})`); continue; }
    if (!CON_OPCIONES.includes(a.tipo)) continue;
    const opciones = new Set((d.opciones ?? []).map((o) => o.id));
    for (const v of valores) {
      if ((a.opciones ?? []).some((o) => o.id === v) && !opciones.has(v)) errores.push(`La opción "${v}" de "${id}" ya tiene respuestas: no se puede borrar (archívala)`);
    }
  }
  return errores;
}

/** ¿Cambió el formulario? (para subir la versión). Compara el contenido, no el orden de las claves. */
export function mismoFormulario(a: Formulario, b: Formulario): boolean {
  const ordenar = (x: unknown): unknown => Array.isArray(x) ? x.map(ordenar)
    : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenar((x as Record<string, unknown>)[k])])) : x;
  return JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b));
}
