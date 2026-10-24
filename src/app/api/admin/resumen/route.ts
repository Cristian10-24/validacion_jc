import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { collections } from "@/lib/db";
import type { Estado } from "@/lib/types";

export type CiudadResumen = { ciudad: string; total: number; validado: number; corregido: number; pendiente: number; monitores: string[] };

export async function GET() {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;

  const { students, users } = await collections();
  const [grupos, monitores] = await Promise.all([
    students.aggregate<{ _id: { ciudad: string; estado: Estado }; n: number }>([{ $group: { _id: { ciudad: "$ciudad", estado: "$estado" }, n: { $sum: 1 } } }]).toArray(),
    users.find({ rol: "monitor", activo: true }, { projection: { nombre: 1, ciudades: 1 } }).toArray(),
  ]);

  const porCiudad = new Map<string, CiudadResumen>();
  for (const g of grupos) {
    const c = porCiudad.get(g._id.ciudad) ?? { ciudad: g._id.ciudad, total: 0, validado: 0, corregido: 0, pendiente: 0, monitores: [] };
    c[g._id.estado] += g.n;
    c.total += g.n;
    porCiudad.set(g._id.ciudad, c);
  }
  for (const m of monitores) for (const ciudad of m.ciudades) porCiudad.get(ciudad)?.monitores.push(m.nombre);

  const ciudades = [...porCiudad.values()];
  const total = ciudades.reduce(
    (acc, c) => ({ total: acc.total + c.total, validado: acc.validado + c.validado, corregido: acc.corregido + c.corregido, pendiente: acc.pendiente + c.pendiente }),
    { total: 0, validado: 0, corregido: 0, pendiente: 0 },
  );
  return NextResponse.json({ total, ciudades, actualizado: new Date().toISOString() });
}
