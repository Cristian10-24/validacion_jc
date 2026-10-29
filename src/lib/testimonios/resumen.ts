// Resumen del avance de testimonios por ciudad. Solo lectura.
import type { SessionUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { testimonios } from "./db";
import { monitoresPorCiudad } from "./usuarios-lectura";
import { filasTestimonios, type FilaTestimonio } from "./vista";

/** total = realizado + pendiente. conComentarios es informativo: pendientes que ya tienen comentarios (≤ pendiente). */
export type Conteo = { total: number; realizado: number; pendiente: number; conComentarios: number };
export type CiudadTestimonios = Conteo & { ciudad: string; monitores: string[] };
export type ResumenTestimonios = { total: Conteo; ciudades: CiudadTestimonios[]; porResolver: { sinDuenio: number; conflicto: number } | null; actualizado: string };

const vacio = (): Conteo => ({ total: 0, realizado: 0, pendiente: 0, conComentarios: 0 });
export const avance = (c: Conteo) => (c.total ? c.realizado / c.total : 0);

function sumar(c: Conteo, f: Pick<FilaTestimonio, "estado" | "conComentarios">) {
  c.total++;
  c[f.estado]++;
  if (f.estado === "pendiente" && f.conComentarios) c.conComentarios++;
}

/** Conteos por ciudad, ordenados de menor a mayor avance (a igual avance, alfabético). Función pura. */
export function contarPorCiudad(filas: Pick<FilaTestimonio, "ciudad" | "estado" | "conComentarios">[], monitores = new Map<string, string[]>()): { total: Conteo; ciudades: CiudadTestimonios[] } {
  const total = vacio();
  const por = new Map<string, CiudadTestimonios>();
  for (const f of filas) {
    const c = por.get(f.ciudad) ?? { ciudad: f.ciudad, ...vacio(), monitores: monitores.get(f.ciudad) ?? [] };
    sumar(c, f);
    sumar(total, f);
    por.set(f.ciudad, c);
  }
  const ciudades = [...por.values()].sort((a, b) => avance(a) - avance(b) || a.ciudad.localeCompare(b.ciudad, "es"));
  return { total, ciudades };
}

export async function resumenTestimonios(user: SessionUser): Promise<ResumenTestimonios> {
  const [filas, monitores] = await Promise.all([filasTestimonios(user), monitoresPorCiudad()]);
  let porResolver: ResumenTestimonios["porResolver"] = null;
  if (puede(user.rol, "testimonios_sin_duenio")) {
    const { respuestas } = await testimonios();
    const [sinDuenio, conflicto] = await Promise.all([respuestas.countDocuments({ cruce: "sin_duenio" }), respuestas.countDocuments({ cruce: "conflicto" })]);
    porResolver = { sinDuenio, conflicto };
  }
  return { ...contarPorCiudad(filas, monitores), porResolver, actualizado: new Date().toISOString() };
}
