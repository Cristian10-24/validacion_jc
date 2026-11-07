import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { clausura } from "@/lib/clausura/db";

/** Imagen de portada (pública, como la portada del evento). No cambia nunca: se cachea un año. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  const { imagenes } = await clausura();
  const img = await imagenes.findOne({ _id: new ObjectId(id) });
  if (!img) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  return new NextResponse(new Uint8Array(img.datos.buffer), {
    headers: { "Content-Type": img.tipo, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
