import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { resumenEncuesta } from "@/lib/encuesta/resumen";

/** Avance de la encuesta por ciudad (coordinación y admin). Admin además recibe cuántas respuestas no coinciden. */
export async function GET() {
  const g = await exigir("encuesta_resumen");
  if (g.error) return g.error;
  return NextResponse.json(await resumenEncuesta(g.user));
}
