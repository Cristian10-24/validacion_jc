import { NextResponse } from "next/server";
import { z } from "zod";
import { MOTIVO_MAX } from "@/lib/activo";
import { exigir, sameOrigin } from "@/lib/auth";
import { cambiarActivo } from "@/lib/estudiantes-activo";

const Body = z.object({
  documento: z.string().min(1).max(30),
  activo: z.boolean(),
  motivo: z.string().max(MOTIVO_MAX).optional(),
}).strict();

const MENSAJES = {
  no_encontrado: ["No encontramos a esa persona.", 404],
  documento: ["Falta el número de documento.", 400],
  motivo: ["Escribe el motivo para inactivar.", 422],
} as const;

/** Inactivar o reactivar (solo administración). Monitores y coordinación reciben 403. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("estudiantes_activo");
  if (g.error) return g.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa los datos." }, { status: 400 });
  const r = await cambiarActivo({ ...parsed.data, user: g.user });
  if (!r.ok) {
    const [mensaje, status] = MENSAJES[r.error];
    return NextResponse.json({ error: r.error, mensaje }, { status });
  }
  return NextResponse.json(r);
}
