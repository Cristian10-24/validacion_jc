import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { vistaSinDuenio } from "@/lib/testimonios/sin-duenio";

/** Respuestas sin dueño, en conflicto y descartadas, con sus candidatos (solo admin). Solo lectura. */
export async function GET() {
  const g = await exigir("testimonios_sin_duenio");
  if (g.error) return g.error;
  return NextResponse.json(await vistaSinDuenio());
}
