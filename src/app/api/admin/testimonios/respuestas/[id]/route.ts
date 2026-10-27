import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { asignarRespuesta, descartarRespuesta } from "@/lib/testimonios/sin-duenio";
import { cleanSpaces } from "@/lib/validation/name";

const Body = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("asignar"), participanteId: z.string().regex(/^[0-9a-f]{24}$/) }).strict(),
  z.object({ accion: z.literal("descartar"), motivo: z.string().max(300).optional() }).strict(),
]);

const ERRORES = {
  no_encontrada: [404, "La respuesta ya no existe."],
  participante_no_existe: [404, "Ese participante ya no está en la lista."],
  ya_resuelta: [409, "Otra persona ya resolvió esta respuesta. Recarga la página."],
} as const;

/** Asignar una respuesta a un participante o descartarla (solo admin). Queda en la auditoría. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("testimonios_sin_duenio");
  if (g.error) return g.error;

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

  const b = parsed.data;
  const r = b.accion === "asignar"
    ? await asignarRespuesta(new ObjectId(id), new ObjectId(b.participanteId), g.user.usuario)
    : await descartarRespuesta(new ObjectId(id), g.user.usuario, cleanSpaces(b.motivo ?? ""));
  if (!r.ok) {
    const [status, mensaje] = ERRORES[r.error];
    return NextResponse.json({ error: r.error, mensaje }, { status });
  }
  return NextResponse.json({ ok: true });
}
