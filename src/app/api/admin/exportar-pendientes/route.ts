import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { collections } from "@/lib/db";
import { excelPendientes, filasPendientes } from "@/lib/export";

/** Excel de pendientes (solo administración): Nombre completo, Correo, Documento, Ciudad. ?ciudad= filtra. Solo lectura. */
export async function GET(req: Request) {
  const g = await exigir("exportar_pendientes");
  if (g.error) return g.error;

  const ciudad = new URL(req.url).searchParams.get("ciudad")?.trim().slice(0, 80) || undefined;
  const { students } = await collections();
  const filas = await filasPendientes(students, ciudad);
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  const sufijo = ciudad ? `_${ciudad.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  const archivo = `pendientes${sufijo}_${hoy}.xlsx`;
  return new NextResponse(new Uint8Array(await excelPendientes(filas)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "X-Filas": String(filas.length),
      "Cache-Control": "no-store",
    },
  });
}
