import { NextResponse } from "next/server";
import { z } from "zod";
import { ingresar } from "@/lib/clausura/estudiante";
import { leerCuerpo, responderVista } from "@/lib/clausura/rutas";
import { bloqueado, MENSAJE_BLOQUEO, registrarFallo } from "@/lib/rateLimit";

const Body = z.object({ documento: z.string().min(1).max(30) }).strict();

/**
 * Ingreso con el documento. Siempre lleva al evento de LA CIUDAD DEL ESTUDIANTE, sin importar por qué enlace entró.
 * Solo cuentan como intento fallido los documentos que no existen (mismo criterio que la validación).
 * No depende de STUDENT_PORTAL_ENABLED: el evento se abre y se cierra desde la base.
 */
export async function POST(req: Request) {
  if (await bloqueado("clausura", req)) return NextResponse.json({ error: "bloqueado", mensaje: MENSAJE_BLOQUEO }, { status: 429 });
  const leido = await leerCuerpo(req, Body);
  if ("error" in leido) return leido.error;
  const r = await ingresar(leido.datos.documento);
  if (r.tipo === "no_encontrado") {
    await registrarFallo("clausura", req);
    return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  }
  if (r.tipo === "pronto") return NextResponse.json({ resultado: "pronto" });
  if (r.tipo === "inactivo") return NextResponse.json({ resultado: "inactivo" });
  return responderVista(r.ctx);
}
