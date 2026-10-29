// Búsqueda de la lista de Testimonios. Función pura: la usa la interfaz (sobre lo que el servidor ya limitó
// por ciudad) y las pruebas. Escribir "duplicados" (o "duplicado") muestra a quienes tienen 2 o más envíos.
import type { FilaTestimonio } from "./vista";

type FilaBusqueda = Pick<FilaTestimonio, "nombre" | "documento" | "correo" | "celular" | "envios" | "ultimoEnvio">;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "duplicados", "Duplicado", "DUPLICADOS"… (sin importar mayúsculas ni tildes). */
export const esBusquedaDuplicados = (q: string) => ["duplicado", "duplicados"].includes(fold(q.trim()));

/**
 * Filtra por nombre, documento, correo o celular (4+ dígitos). Con "duplicados": solo quienes tienen 2 o más
 * envíos asignados. `envios` ya trae solo los asignados (automáticos o manuales): sin dueño, en conflicto y
 * descartados no cuentan.
 */
export function buscarTestimonios<T extends FilaBusqueda>(filas: T[], q: string): T[] {
  if (esBusquedaDuplicados(q)) return filas.filter((f) => f.envios.length >= 2);
  const k = fold(q.trim()), kd = q.replace(/\D/g, "");
  return filas.filter((f) => !k || fold(`${f.nombre} ${f.documento} ${f.correo}`).includes(k) || (kd.length >= 4 && f.celular.includes(kd)));
}

/** Orden de los duplicados: más envíos primero; a igual número, el envío más reciente primero. */
export function compararDuplicados(a: FilaBusqueda, b: FilaBusqueda): number {
  return b.envios.length - a.envios.length || (b.ultimoEnvio ?? 0) - (a.ultimoEnvio ?? 0) || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
}
