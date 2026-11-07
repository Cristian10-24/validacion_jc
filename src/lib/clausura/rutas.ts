// Piezas comunes de las rutas del estudiante: leer el cuerpo con tope de tamaño, exigir la cookie y responder.
import { NextResponse } from "next/server";
import type { z } from "zod";
import { sameOrigin } from "@/lib/auth";
import { cargar, vistaEstudiante, type Contexto, type Resultado } from "./estudiante";
import { COOKIE_CLAUSURA, crearToken, opcionesCookie, sesionActual } from "./sesion";

const MAX_CUERPO = 64 * 1024;

/** Cuerpo JSON validado con el esquema; o la respuesta de error (400 / 413). */
export async function leerCuerpo<T extends z.ZodType>(req: Request, esquema: T): Promise<{ datos: z.infer<T> } | { error: NextResponse }> {
  const texto = await req.text().catch(() => "");
  if (texto.length > MAX_CUERPO) return { error: NextResponse.json({ error: "muy_grande" }, { status: 413 }) };
  let json: unknown = null;
  try { json = JSON.parse(texto); } catch { /* queda null */ }
  const r = esquema.safeParse(json);
  if (!r.success) return { error: NextResponse.json({ error: "datos_invalidos" }, { status: 400 }) };
  return { datos: r.data };
}

/** Exige mismo origen (si cambia datos) y una cookie válida. 401 = debe volver a escribir su documento. */
export async function conSesion(req: Request, muta: boolean): Promise<{ ctx: Contexto } | { error: NextResponse }> {
  if (muta && !sameOrigin(req)) return { error: NextResponse.json({ error: "origen" }, { status: 403 }) };
  const s = await sesionActual();
  const ctx = s ? await cargar(s) : null;
  if (!ctx) return { error: NextResponse.json({ error: "sesion" }, { status: 401 }) };
  return { ctx };
}

/** Responde con la vista del estudiante y renueva la cookie (dura 2 horas desde la última actividad). */
export function responderVista(ctx: Contexto, extra: Record<string, unknown> = {}, status = 200): NextResponse {
  const res = NextResponse.json({ ...vistaEstudiante(ctx), ...extra }, { status });
  res.cookies.set(COOKIE_CLAUSURA, crearToken({ studentId: ctx.student._id.toHexString(), eventoId: ctx.evento._id.toHexString() }), opcionesCookie);
  return res;
}

export function responder(r: Resultado): NextResponse {
  if (!r.ok) return NextResponse.json({ error: r.error, errores: r.errores, seccion: r.seccion }, { status: r.status });
  return responderVista(r.ctx, r.siguiente ? { siguiente: r.siguiente } : {});
}
