import ExcelJS from "exceljs";
import type { Collection } from "mongodb";
import { filtroActivos } from "./activo";
import type { Student } from "./types";

// Excel final para certificados, con dos pestañas cruzables por ID (documento):
//  - "Datos originales": todos los estudiantes con el nombre y correo tal como llegaron en la carga.
//  - "Datos validados": solo los validados, con su nombre y correo definitivos.
// Lo usan el botón de la administración y el script `npm run export`. Solo lectura.

export type FilaOriginal = { id: string; nombre: string; email: string; ciudad: string };
export type FilaValidada = { id: string; nombre: string; ciudad: string; correo: string };
export type DatosCertificados = { originales: FilaOriginal[]; validados: FilaValidada[] };

const porCiudadYNombre = (a: { ciudad: string; nombre: string }, b: { ciudad: string; nombre: string }) =>
  a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es");

/**
 * soloValidados=false: la pestaña "Datos validados" incluye a todos con su dato más reciente (para revisar, no para certificar).
 * ciudad: si viene, ambas pestañas se limitan a esa ciudad.
 * incluirInactivos: por defecto los inactivos NO salen en ninguna pestaña.
 */
export async function datosCertificados(students: Collection<Student>, opciones: { soloValidados?: boolean; ciudad?: string; incluirInactivos?: boolean } = {}): Promise<DatosCertificados> {
  const { soloValidados = true, ciudad, incluirInactivos = false } = opciones;
  const docs = await students
    .find({ ...(ciudad ? { ciudad } : {}), ...filtroActivos(incluirInactivos) }, {
      projection: { documento: 1, ciudad: 1, estado: 1, nombre: 1, correo: 1, nombreOriginal: 1, correoOriginal: 1, nombrePropuesto: 1, correoPropuesto: 1 },
    })
    .toArray();

  const originales = docs
    .map((s) => ({ id: s.documento, nombre: s.nombreOriginal ?? "", email: s.correoOriginal ?? "", ciudad: s.ciudad }))
    .sort(porCiudadYNombre);
  const validados = docs
    .filter((s) => !soloValidados || s.estado === "validado")
    .map((s) => ({ id: s.documento, nombre: s.nombrePropuesto ?? s.nombre, ciudad: s.ciudad, correo: s.correoPropuesto ?? s.correo }))
    .sort(porCiudadYNombre);
  return { originales, validados };
}

export async function excelCertificados({ originales, validados }: DatosCertificados): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const wsO = wb.addWorksheet("Datos originales");
  wsO.columns = [
    { header: "ID", key: "id", width: 18 },
    { header: "Nombre completo", key: "nombre", width: 42 },
    { header: "Email", key: "email", width: 40 },
    { header: "Ciudad", key: "ciudad", width: 22 },
  ];
  wsO.addRows(originales);

  const wsV = wb.addWorksheet("Datos validados");
  wsV.columns = [
    { header: "ID", key: "id", width: 18 },
    { header: "Nombre completo validado", key: "nombre", width: 42 },
    { header: "Ciudad", key: "ciudad", width: 22 },
    { header: "Correo nuevo", key: "correo", width: 40 },
  ];
  wsV.addRows(validados);

  for (const ws of [wsO, wsV]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    // El ID como texto: Excel no le quita ceros a la izquierda ni lo pasa a notación científica.
    ws.getColumn("id").numFmt = "@";
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ----- Pendientes (solo administración): para hacerles seguimiento -----

export type FilaPendiente = { nombre: string; correo: string; documento: string; ciudad: string };

/** Estudiantes en estado pendiente, opcionalmente de una sola ciudad. Sin inactivos salvo que se pidan. Solo lectura. */
export async function filasPendientes(students: Collection<Student>, ciudad?: string, incluirInactivos = false): Promise<FilaPendiente[]> {
  const docs = await students
    .find({ estado: "pendiente", ...(ciudad ? { ciudad } : {}), ...filtroActivos(incluirInactivos) }, { projection: { nombre: 1, correo: 1, documento: 1, ciudad: 1 } })
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
