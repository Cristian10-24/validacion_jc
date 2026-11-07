import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { collections } from "@/lib/db";
import { resumenValidacion } from "@/lib/resumen-validacion";

export type { CiudadResumen } from "@/lib/resumen-validacion";

export async function GET() {
  const g = await exigir("ver_resumen");
  if (g.error) return g.error;

  const { students, users } = await collections();
  const { total, ciudades } = await resumenValidacion(students, users);
  return NextResponse.json({ total, ciudades, actualizado: new Date().toISOString() });
}
