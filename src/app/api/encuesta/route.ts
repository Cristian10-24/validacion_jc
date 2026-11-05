import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { filasEncuesta } from "@/lib/encuesta/vista";

/** Participantes con su estado en la encuesta final. Monitor: solo sus ciudades (validado en el servidor). */
export async function GET() {
  const g = await exigir("encuesta_ver");
  if (g.error) return g.error;
  return NextResponse.json({ filas: await filasEncuesta(g.user) });
}
