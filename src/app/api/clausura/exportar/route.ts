import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { eventoValido, excelClausura } from "@/lib/clausura/exportar";

/** Excel de respuestas (?evento=<id>|todos&sinResponder=1). Monitor: solo sus ciudades (filtro en la consulta). */
export async function GET(req: Request) {
  const g = await exigir("clausura_exportar");
  if (g.error) return g.error;
  const sp = new URL(req.url).searchParams;
  const evento = eventoValido(sp.get("evento") ?? "todos");
  if (!evento) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const { buffer, archivo, filas } = await excelClausura(g.user, { evento, sinResponder: sp.get("sinResponder") === "1" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "X-Filas": String(filas),
      "Cache-Control": "no-store",
    },
  });
}
