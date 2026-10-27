import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { resumenTestimonios } from "@/lib/testimonios/resumen";

/** Avance de testimonios por ciudad (coordinación y admin). Admin además recibe sin dueño y conflictos. */
export async function GET() {
  const g = await exigir("testimonios_resumen");
  if (g.error) return g.error;
  return NextResponse.json(await resumenTestimonios(g.user));
}
