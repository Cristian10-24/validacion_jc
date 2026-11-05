// Orden y búsqueda de la lista de la encuesta. Funciones puras (se usan en el navegador).
import type { FilaEncuesta } from "./vista";

export type FilaOrdenEncuesta = Pick<FilaEncuesta, "estado" | "nombre" | "ultimaRespuesta" | "ultimoComentario">;

/** 0: pendiente sin comentarios · 1: pendiente con comentarios · 2: respondió. */
const grupo = (f: FilaOrdenEncuesta) => (f.estado === "respondio" ? 2 : f.ultimoComentario === null ? 0 : 1);

/**
 * Mismo criterio que testimonios: primero los pendientes sin comentarios (alfabético), luego los pendientes
 * con comentarios (actividad más reciente primero) y al final los que respondieron (respuesta más reciente primero).
 */
export function compararEncuesta(a: FilaOrdenEncuesta, b: FilaOrdenEncuesta): number {
  const g = grupo(a) - grupo(b);
  if (g !== 0) return g;
  const d = grupo(a) === 1 ? (b.ultimoComentario ?? 0) - (a.ultimoComentario ?? 0)
    : grupo(a) === 2 ? (b.ultimaRespuesta ?? 0) - (a.ultimaRespuesta ?? 0) : 0;
  return d !== 0 ? d : a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Búsqueda por nombre, documento, correo o celular (todas las palabras deben aparecer). */
export function buscarEncuesta<F extends Pick<FilaEncuesta, "nombre" | "documento" | "correo" | "celular">>(filas: F[], q: string): F[] {
  const palabras = sinTildes(q).split(/\s+/).filter(Boolean);
  if (!palabras.length) return filas;
  return filas.filter((f) => {
    const texto = sinTildes(`${f.nombre} ${f.documento} ${f.correo} ${f.celular}`);
    const digitos = `${f.documento} ${f.celular}`.replace(/\D/g, "");
    return palabras.every((p) => texto.includes(p) || (/^\d+$/.test(p.replace(/\D/g, "")) && p.replace(/\D/g, "").length >= 3 && digitos.includes(p.replace(/\D/g, ""))));
  });
}
