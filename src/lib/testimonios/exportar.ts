// Excel de pendientes de testimonio (todos los que aún no envían el video, con o sin comentarios):
// Nombre completo, Celular (con indicativo), Correo, Documento, Ciudad, Con comentarios (Sí/No) y Último comentario.
// Solo lectura; el alcance por ciudad lo pone filasTestimonios (monitor: solo sus ciudades).
import ExcelJS from "exceljs";
import { celularConIndicativo } from "./celular";
import { ultimaActividad } from "./estado";
import type { FilaTestimonio } from "./vista";

export type FilaPendienteTestimonio = { nombre: string; celular: string; correo: string; documento: string; ciudad: string; conComentarios: "Sí" | "No"; ultimoComentario: string };

/**
 * "26/10/2026 8:00 a. m. · Coordinadora Demo: Confirmó que lo envía hoy." (hora de Colombia).
 * Si la actividad más reciente fue una edición: la fecha de la edición y "(editado)".
 */
export function textoComentario(c: { texto: string; fecha: string; editadoEn?: string | null; autor: { nombre: string } }, editado = false): string {
  const d = new Date(editado && c.editadoEn ? c.editadoEn : c.fecha), tz = "America/Bogota";
  const cuando = `${d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz })} ${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;
  return `${cuando}${editado ? " (editado)" : ""} · ${c.autor.nombre}: ${c.texto.replace(/\s*\n\s*/g, " ")}`;
}

/** Todos los pendientes, de una ciudad si se indica. Orden: ciudad, primero los sin comentarios, nombre. */
export function pendientesParaExportar(filas: FilaTestimonio[], ciudad?: string): FilaPendienteTestimonio[] {
  return filas
    .filter((f) => f.estado === "pendiente" && (!ciudad || f.ciudad === ciudad))
    .map((f): FilaPendienteTestimonio => {
      const ua = ultimaActividad(f.comentarios);
      return {
        nombre: f.nombre, celular: celularConIndicativo(f.celular, f.ciudad), correo: f.correo, documento: f.documento, ciudad: f.ciudad,
        conComentarios: f.conComentarios ? "Sí" : "No", ultimoComentario: ua ? textoComentario(f.comentarios[ua.indice], ua.editado) : "",
      };
    })
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || (a.conComentarios === b.conComentarios ? 0 : a.conComentarios === "No" ? -1 : 1) || a.nombre.localeCompare(b.nombre, "es"));
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
    { header: "Con comentarios", key: "conComentarios", width: 16 },
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
