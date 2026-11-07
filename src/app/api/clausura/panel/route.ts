import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { datosPanel } from "@/lib/clausura/panel";

/** Lista de estudiantes de un evento con su estado. Monitor: solo sus ciudades (validado en la consulta). */
export async function GET(req: Request) {
  const g = await exigir("clausura_ver");
  if (g.error) return g.error;
  const evento = new URL(req.url).searchParams.get("evento");
  return NextResponse.json(await datosPanel(g.user, evento));
}
