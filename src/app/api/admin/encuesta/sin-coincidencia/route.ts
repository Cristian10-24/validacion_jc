import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { respuestasSinCoincidencia } from "@/lib/encuesta/vista";

/** Respuestas de la encuesta que no coinciden con ningún participante (solo administración). Solo lectura. */
export async function GET() {
  const g = await exigir("encuesta_sin_coincidencia");
  if (g.error) return g.error;
  return NextResponse.json({ filas: await respuestasSinCoincidencia() });
}
