import ExcelJS from "exceljs";
import path from "node:path";

/** Convierte cualquier valor de celda de ExcelJS a texto. */
export function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("text" in value) return String(value.text); // hipervínculos (correos)
    if ("result" in value) return value.result == null ? "" : String(value.result); // fórmulas
    return "";
  }
  return String(value);
}

/** "Número de Documento" -> "numero de documento" */
export function headerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Lee la primera hoja de un .xlsx o .csv como filas { encabezado: texto }. */
export async function readRows(file: string): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  const sheet =
    path.extname(file).toLowerCase() === ".csv" ? await wb.csv.readFile(file) : (await wb.xlsx.readFile(file), wb.worksheets[0]);
  if (!sheet) throw new Error("El archivo no tiene hojas");

  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = headerKey(cellText(cell.value));
  });

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    const obj: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      if (headers[col]) obj[headers[col]] = cellText(cell.value).trim();
    });
    if (Object.values(obj).some(Boolean)) rows.push(obj);
  });
  return rows;
}
