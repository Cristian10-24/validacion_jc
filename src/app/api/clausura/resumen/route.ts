import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { resumenClausura } from "@/lib/clausura/resumen";

/** Avance por ciudad (coordinación y admin). */
export async function GET() {
  const g = await exigir("clausura_resumen");
  if (g.error) return g.error;
  return NextResponse.json(await resumenClausura(g.user));
}
