import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { clausura } from "@/lib/clausura/db";
import { estudianteEnAlcance } from "@/lib/clausura/panel";

/**
 * Reabrir una respuesta ya enviada (?evento=<id>): solo admin. El estudiante puede editarla y debe volver a enviarla;
 * al reenviar se cierra otra vez. Queda en clausura_auditoria.
 */
export async function POST(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("clausura_gestionar");
  if (g.error) return g.error;
  const { studentId } = await params;
  const ok = await estudianteEnAlcance(g.user, new URL(req.url).searchParams.get("evento") ?? "", studentId);
  if (!ok) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  const { respuestas, auditoria } = await clausura();
  const en = new Date();
  const r = await respuestas.findOneAndUpdate(
    { eventoId: ok.evento._id, studentId: ok.studentId, estado: "enviada" },
    { $set: { reabierta: { por: g.user.usuario, en }, actualizadaEn: en } },
    { projection: { documento: 1 } },
  );
  if (!r) return NextResponse.json({ error: "no_enviada", mensaje: "Solo se puede reabrir una respuesta enviada." }, { status: 409 });
  await auditoria.insertOne({ accion: "reabrir", eventoId: ok.evento._id, slug: ok.evento.slug, detalle: { studentId: ok.studentId.toHexString(), documento: r.documento }, por: g.user.usuario, fecha: en });
  return NextResponse.json({ ok: true, reabierta: { por: g.user.usuario, en: en.toISOString() } });
}
