import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { clausura } from "@/lib/clausura/db";
import { estudianteEnAlcance } from "@/lib/clausura/panel";
import { leerTextoComentario } from "@/lib/testimonios/comentarios";

/** Comentario de seguimiento sobre un estudiante en un evento (?evento=<id>). Fuera del alcance: 404. */
export async function POST(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("clausura_comentar");
  if (g.error) return g.error;
  const { studentId } = await params;
  const eventoId = new URL(req.url).searchParams.get("evento") ?? "";
  const leido = await leerTextoComentario(req);
  if ("error" in leido) return leido.error;
  const ok = await estudianteEnAlcance(g.user, eventoId, studentId);
  if (!ok) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  const { comentarios } = await clausura();
  const c = { _id: new ObjectId(), eventoId: ok.evento._id, studentId: ok.studentId, texto: leido.texto, autor: { usuario: g.user.usuario, nombre: g.user.nombre, rol: g.user.rol }, fecha: new Date() };
  await comentarios.insertOne(c);
  return NextResponse.json({ comentario: { id: c._id.toHexString(), texto: c.texto, autor: c.autor, fecha: c.fecha.toISOString(), editadoEn: null } }, { status: 201 });
}
