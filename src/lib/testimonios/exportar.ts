// Excel de pendientes de testimonio (Pendiente y Seguimiento: los que aún no envían el video):
// Nombre completo, Celular (con indicativo), Correo, Documento, Ciudad, Estado y Último comentario.
// Solo lectura; el alcance por ciudad lo pone filasTestimonios (monitor: solo sus ciudades).
import ExcelJS from "exceljs";
import { celularConIndicativo } from "./celular";
import type { FilaTestimonio } from "./vista";

export type FilaPendienteTestimonio = { nombre: string; celular: string; correo: string; documento: string; ciudad: string; estado: "Pendiente" | "Seguimiento"; ultimoComentario: string };

/** "26/10/2026 8:00 a. m. · Coordinadora Demo: Confirmó que lo envía hoy." (hora de Colombia). */
export function textoComentario(c: { texto: string; fecha: string; autor: { nombre: string } }): string {
  const d = new Date(c.fecha), tz = "America/Bogota";
  const cuando = `${d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz })} ${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;
  return `${cuando} · ${c.autor.nombre}: ${c.texto.replace(/\s*\n\s*/g, " ")}`;
}

/** Sin video todavía (Pendiente y Seguimiento), de una ciudad si se indica. Orden: ciudad, Pendiente antes que Seguimiento, nombre. */
export function pendientesParaExportar(filas: FilaTestimonio[], ciudad?: string): FilaPendienteTestimonio[] {
  return filas
    .filter((f) => f.estado !== "realizado" && (!ciudad || f.ciudad === ciudad))
    .map((f): FilaPendienteTestimonio => {
      const ultimo = f.comentarios[f.comentarios.length - 1];
      return {
        nombre: f.nombre, celular: celularConIndicativo(f.celular, f.ciudad), correo: f.correo, documento: f.documento, ciudad: f.ciudad,
        estado: f.estado === "seguimiento" ? "Seguimiento" : "Pendiente", ultimoComentario: ultimo ? textoComentario(ultimo) : "",
      };
    })
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || (a.estado === b.estado ? 0 : a.estado === "Pendiente" ? -1 : 1) || a.nombre.localeCompare(b.nombre, "es"));
}

export async function excelPendientesTestimonios(filas: FilaPendienteTestimonio[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pendientes");
  ws.columns = [
    { header: "Nombre completo", key: "nombre", width: 40 },
    { header: "Celular", key: "celular", width: 20 },
    { header: "Correo", key: "correo", width: 36 },
    { header: "Documento", key: "documento", width: 18 },
    { header: "Ciudad", key: "ciudad", width: 20 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Último comentario", key: "ultimoComentario", width: 70 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRows(filas);
  // Celular y documento como texto: Excel no los convierte a número ni les quita ceros o el "+".
  ws.getColumn("celular").numFmt = "@";
  ws.getColumn("documento").numFmt = "@";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** pendientes_testimonios_Cali_2026-10-26.xlsx, o pendientes_testimonios_2026-10-26.xlsx sin ciudad. */
export function archivoPendientes(ciudad?: string, hoy = new Date()): string {
  const fecha = hoy.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  const sufijo = ciudad ? `_${ciudad.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "";
  return `pendientes_testimonios${sufijo}_${fecha}.xlsx`;
}
