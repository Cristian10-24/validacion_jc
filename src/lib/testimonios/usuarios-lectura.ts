// ÚNICA lectura del módulo fuera de testimonios_*: nombres de los monitores por ciudad, para el resumen.
// Solo find() con proyección; nunca escribe en users (lo vigila tests/testimonios-seguridad.test.ts).
import { getDb } from "@/lib/db";

export async function monitoresPorCiudad(): Promise<Map<string, string[]>> {
  const db = await getDb();
  const monitores = await db.collection<{ nombre: string; ciudades: string[] }>("users")
    .find({ rol: "monitor", activo: true }, { projection: { nombre: 1, ciudades: 1 } })
    .toArray();
  const porCiudad = new Map<string, string[]>();
  for (const m of monitores) for (const c of m.ciudades ?? []) porCiudad.set(c, [...(porCiudad.get(c) ?? []), m.nombre]);
  return porCiudad;
}
