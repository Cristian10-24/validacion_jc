import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { encuesta } from "@/lib/encuesta/db";
import { leerTextoComentario } from "@/lib/testimonios/comentarios";
import { alcanceTestimonios } from "@/lib/testimonios/vista";

type Params = { params: Promise<{ id: string; comentarioId: string }> };

/**
 * Editar un comentario de la encuesta. Solo su autor puede hacerlo (los demás: 403). Participante fuera del
 * alcance: 404. Se actualiza SOLO ese comentario. No se guarda el texto anterior. No se pueden borrar.
 */
export async function PATCH(req: Request, { params }: Params) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("encuesta_comentar");
  if (g.error) return g.error;

  const { id, comentarioId } = await params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(comentarioId)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const leido = await leerTextoComentario(req);
  if ("error" in leido) return leido.error;

  const { participantes, comentarios } = await encuesta();
  const participante = await participantes.findOne({ _id: new ObjectId(id), ...alcanceTestimonios(g.user) }, { projection: { _id: 1 } });
  if (!participante) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  const actual = await comentarios.findOne({ _id: new ObjectId(comentarioId), participanteId: participante._id }, { projection: { autor: 1, fecha: 1 } });
  if (!actual) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  if (actual.autor.usuario !== g.user.usuario) {
    return NextResponse.json({ error: "sin_permiso", mensaje: "Solo quien escribió el comentario puede editarlo." }, { status: 403 });
  }

  const editadoEn = new Date();
  const r = await comentarios.updateOne(
    { _id: actual._id, participanteId: participante._id, "autor.usuario": g.user.usuario },
    { $set: { texto: leido.texto, editadoEn, editadoPor: { usuario: g.user.usuario, nombre: g.user.nombre } } },
  );
  if (r.matchedCount === 0) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  return NextResponse.json({
    comentario: { id: comentarioId, texto: leido.texto, autor: actual.autor, fecha: actual.fecha.toISOString(), editadoEn: editadoEn.toISOString() },
  });
}
