import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { filasTestimonios } from "@/lib/testimonios/vista";

/** Lista de participantes de testimonios con su estado. Monitor: solo sus ciudades (validado en el servidor). */
export async function GET() {
  const g = await exigir("testimonios_ver");
  if (g.error) return g.error;
  return NextResponse.json({ filas: await filasTestimonios(g.user) });
}
