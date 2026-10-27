import { NextResponse } from "next/server";
import { exigir } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { archivoPendientes, excelPendientesTestimonios, pendientesParaExportar } from "@/lib/testimonios/exportar";
import { filasTestimonios } from "@/lib/testimonios/vista";

/**
 * Excel de pendientes de testimonio. ?ciudad= exporta solo esa ciudad.
 * Monitor: solo sus ciudades; pedir otra ciudad responde 403 (validado aquí, no solo en la interfaz). Solo lectura.
 */
export async function GET(req: Request) {
  const g = await exigir("testimonios_exportar_pendientes");
  if (g.error) return g.error;

  const ciudad = new URL(req.url).searchParams.get("ciudad")?.trim().slice(0, 80) || undefined;
  if (ciudad && !puede(g.user.rol, "ver_todas_las_ciudades") && !g.user.ciudades.includes(ciudad)) {
    return NextResponse.json({ error: "sin_permiso", mensaje: "Solo puedes exportar los pendientes de tus ciudades." }, { status: 403 });
  }
  const filas = pendientesParaExportar(await filasTestimonios(g.user), ciudad);
  return new NextResponse(new Uint8Array(await excelPendientesTestimonios(filas)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${archivoPendientes(ciudad)}"`,
      "X-Filas": String(filas.length),
      "Cache-Control": "no-store",
    },
  });
}
