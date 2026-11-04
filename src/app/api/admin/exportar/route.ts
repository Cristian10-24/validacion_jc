import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { collections } from "@/lib/db";
import { datosCertificados, excelCertificados, nombreArchivo } from "@/lib/export";

/**
 * Excel final para certificados, con dos pestañas cruzables por ID:
 * "Datos originales" (todos, como llegaron en la carga) y "Datos validados" (solo validados).
 * ?ciudad= filtra ambas pestañas. Solo lectura.
 */
export async function GET(req: Request) {
  const g = await exigir("descargar_excel");
  if (g.error) return g.error;

  const ciudad = new URL(req.url).searchParams.get("ciudad")?.trim().slice(0, 80) || undefined;
  const { students } = await collections();
  const datos = await datosCertificados(students, { ciudad });
  const sufijo = ciudad ? `_${ciudad.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  const archivo = nombreArchivo(sufijo);
  return new NextResponse(new Uint8Array(await excelCertificados(datos)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "X-Filas": String(datos.validados.length),
      "Cache-Control": "no-store",
    },
  });
}
