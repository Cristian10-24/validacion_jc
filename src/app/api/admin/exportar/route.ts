import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { collections } from "@/lib/db";
import { excelCertificados, filasCertificados, nombreArchivo } from "@/lib/export";

/** Excel final para certificados (solo validados): Nombre completo, Correo, Ciudad. */
export async function GET() {
  const g = await exigir("descargar_excel");
  if (g.error) return g.error;

  const { students } = await collections();
  const filas = await filasCertificados(students, true);
  const archivo = nombreArchivo();
  return new NextResponse(new Uint8Array(await excelCertificados(filas)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivo}"`,
      "X-Filas": String(filas.length),
      "Cache-Control": "no-store",
    },
  });
}
