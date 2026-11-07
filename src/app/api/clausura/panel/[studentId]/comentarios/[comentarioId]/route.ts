import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { clausura } from "@/lib/clausura/db";
import { estudianteEnAlcance } from "@/lib/clausura/panel";
import { leerTextoComentario } from "@/lib/testimonios/comentarios";

type Params = { params: Promise<{ studentId: string; comentarioId: string }> };

/** Editar un comentario: solo su autor (los demás: 403). Fuera del alcance: 404. No se guarda el texto anterior. */
export async function PATCH(req: Request, { params }: Params) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("clausura_comentar");
  if (g.error) return g.error;
  const { studentId, comentarioId } = await params;
  if (!ObjectId.isValid(comentarioId)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const eventoId = new URL(req.url).searchParams.get("evento") ?? "";
  const leido = await leerTextoComentario(req);
  if ("error" in leido) return leido.error;
  const ok = await estudianteEnAlcance(g.user, eventoId, studentId);
  if (!ok) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  const { comentarios } = await clausura();
  const actual = await comentarios.findOne({ _id: new ObjectId(comentarioId), eventoId: ok.evento._id, studentId: ok.studentId }, { projection: { autor: 1, fecha: 1 } });
  if (!actual) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  if (actual.autor.usuario !== g.user.usuario) return NextResponse.json({ error: "sin_permiso", mensaje: "Solo quien escribió el comentario puede editarlo." }, { status: 403 });

  const editadoEn = new Date();
  const r = await comentarios.updateOne(
    { _id: actual._id, eventoId: ok.evento._id, studentId: ok.studentId, "autor.usuario": g.user.usuario },
    { $set: { texto: leido.texto, editadoEn, editadoPor: { usuario: g.user.usuario, nombre: g.user.nombre } } },
  );
  if (r.matchedCount === 0) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  return NextResponse.json({ comentario: { id: comentarioId, texto: leido.texto, autor: actual.autor, fecha: actual.fecha.toISOString(), editadoEn: editadoEn.toISOString() } });
}
