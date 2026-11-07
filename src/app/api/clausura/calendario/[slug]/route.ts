import { NextResponse } from "next/server";
import { generarIcs } from "@/lib/clausura/calendario";
import { clausura } from "@/lib/clausura/db";

/** Archivo .ics del evento ("Agregar a mi calendario"). Público, como la portada; los borradores no existen. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  const { eventos } = await clausura();
  const e = await eventos.findOne({ slug, estado: { $ne: "borrador" } });
  if (!e) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  return new NextResponse(generarIcs(e), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
