// Avance de la encuesta final por ciudad. Solo lectura. Mismo esquema que el avance de testimonios.
import type { SessionUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { monitoresPorCiudad } from "@/lib/testimonios/usuarios-lectura";
import { contarSinCoincidencia, filasEncuesta, type FilaEncuesta } from "./vista";

/** total = respondio + pendiente (faltan). conComentarios: pendientes que ya tienen comentarios (≤ pendiente). */
export type ConteoEncuesta = { total: number; respondio: number; pendiente: number; conComentarios: number };
export type CiudadEncuesta = ConteoEncuesta & { ciudad: string; monitores: string[] };
export type ResumenEncuesta = { total: ConteoEncuesta; ciudades: CiudadEncuesta[]; sinCoincidencia: number | null; actualizado: string };

const vacio = (): ConteoEncuesta => ({ total: 0, respondio: 0, pendiente: 0, conComentarios: 0 });
const avance = (c: ConteoEncuesta) => (c.total ? c.respondio / c.total : 0);

function sumar(c: ConteoEncuesta, f: Pick<FilaEncuesta, "estado" | "conComentarios">) {
  c.total++;
  c[f.estado]++;
  if (f.estado === "pendiente" && f.conComentarios) c.conComentarios++;
}

/** Conteos por ciudad, de menor a mayor avance (a igual avance, alfabético). Función pura. */
export function contarEncuestaPorCiudad(filas: Pick<FilaEncuesta, "ciudad" | "estado" | "conComentarios">[], monitores = new Map<string, string[]>()): { total: ConteoEncuesta; ciudades: CiudadEncuesta[] } {
  const total = vacio();
  const por = new Map<string, CiudadEncuesta>();
  for (const f of filas) {
    const c = por.get(f.ciudad) ?? { ciudad: f.ciudad, ...vacio(), monitores: monitores.get(f.ciudad) ?? [] };
    sumar(c, f);
    sumar(total, f);
    por.set(f.ciudad, c);
  }
  const ciudades = [...por.values()].sort((a, b) => avance(a) - avance(b) || a.ciudad.localeCompare(b.ciudad, "es"));
  return { total, ciudades };
}

export async function resumenEncuesta(user: SessionUser): Promise<ResumenEncuesta> {
  const [filas, monitores, sinCoincidencia] = await Promise.all([
    filasEncuesta(user),
    monitoresPorCiudad(),
    puede(user.rol, "encuesta_sin_coincidencia") ? contarSinCoincidencia() : Promise.resolve(null),
  ]);
  return { ...contarEncuestaPorCiudad(filas, monitores), sinCoincidencia, actualizado: new Date().toISOString() };
}
