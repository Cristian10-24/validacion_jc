import ExcelJS from "exceljs";
import type { Collection } from "mongodb";
import type { Student } from "./types";

// Excel final para certificados: Nombre completo, Correo (el corregido/aprobado) y Ciudad.
// Lo usan el botón de la administración y el script `npm run export`.

export type FilaCertificado = { nombre: string; correo: string; ciudad: string };

/** soloValidados=true: la lista para certificar. false: todos con su dato más reciente (para revisar). */
export async function filasCertificados(students: Collection<Student>, soloValidados = true): Promise<FilaCertificado[]> {
  const docs = await students
    .find(soloValidados ? { estado: "validado" } : {}, { projection: { nombre: 1, correo: 1, ciudad: 1, nombrePropuesto: 1, correoPropuesto: 1 } })
    .toArray();
  return docs
    .map((s) => ({ nombre: s.nombrePropuesto ?? s.nombre, correo: s.correoPropuesto ?? s.correo, ciudad: s.ciudad }))
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es"));
}

export async function excelCertificados(filas: FilaCertificado[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Certificados");
  ws.columns = [
    { header: "Nombre completo", key: "nombre", width: 42 },
    { header: "Correo", key: "correo", width: 40 },
    { header: "Ciudad", key: "ciudad", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRows(filas);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ----- Pendientes (solo administración): para hacerles seguimiento -----

export type FilaPendiente = { nombre: string; correo: string; documento: string; ciudad: string };

/** Estudiantes en estado pendiente, opcionalmente de una sola ciudad. Solo lectura. */
export async function filasPendientes(students: Collection<Student>, ciudad?: string): Promise<FilaPendiente[]> {
  const docs = await students
    .find({ estado: "pendiente", ...(ciudad ? { ciudad } : {}) }, { projection: { nombre: 1, correo: 1, documento: 1, ciudad: 1 } })
    .toArray();
  return docs
    .map((s) => ({ nombre: s.nombre, correo: s.correo, documento: s.documento, ciudad: s.ciudad }))
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es"));
}

export async function excelPendientes(filas: FilaPendiente[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pendientes");
  ws.columns = [
    { header: "Nombre completo", key: "nombre", width: 42 },
    { header: "Correo", key: "correo", width: 40 },
    { header: "Documento", key: "documento", width: 18 },
    { header: "Ciudad", key: "ciudad", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRows(filas);
  // El documento como texto: Excel no lo convierte a número ni le quita ceros.
  ws.getColumn("documento").numFmt = "@";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function nombreArchivo(sufijo = ""): string {
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }); // AAAA-MM-DD
  return `certificados_jovenes_creativos_${hoy}${sufijo}.xlsx`;
}
