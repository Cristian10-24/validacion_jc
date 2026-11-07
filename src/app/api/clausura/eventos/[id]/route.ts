import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { actualizarEvento, cambiarEstado, DatosEvento } from "@/lib/clausura/gestion";
import { leerCuerpo } from "@/lib/clausura/rutas";

const Body = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("datos"), datos: DatosEvento }).strict(),
  z.object({ accion: z.literal("estado"), estado: z.enum(["borrador", "abierto", "cerrado"]) }).strict(),
  z.object({ accion: z.literal("edicion"), permitir: z.boolean() }).strict(),
]);

/** Editar datos del evento, abrir/cerrar o permitir editar después de enviar. Solo admin. Queda en la auditoría. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("clausura_gestionar");
  if (g.error) return g.error;
  const leido = await leerCuerpo(req, Body);
  if ("error" in leido) return leido.error;
  const { id } = await params;
  const b = leido.datos;
  const r = b.accion === "datos" ? await actualizarEvento(id, b.datos, g.user.usuario)
    : b.accion === "estado" ? await cambiarEstado(id, { estado: b.estado }, g.user.usuario)
      : await cambiarEstado(id, { permitirEdicion: b.permitir }, g.user.usuario);
  if (!r.ok) return NextResponse.json({ error: "invalido", errores: r.errores }, { status: r.status });
  return NextResponse.json({ ok: true });
}
