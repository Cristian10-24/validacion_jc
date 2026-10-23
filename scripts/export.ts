// Uso: npm run export [-- archivo.xlsx] [--todos]
// Excel final para certificados: Nombre completo, Correo y Ciudad.
// Por defecto solo los VALIDADOS (los corregidos entran cuando su monitor los aprueba).
// --todos: incluye a todos con su dato más reciente (útil para revisar, no para certificar).
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { closeDb, collections, dbHost, dbName } from "@/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const todos = args.includes("--todos");
  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Bogota" }); // AAAA-MM-DD
  const salida = args.find((a) => !a.startsWith("--")) ?? path.join("exports", `certificados_jovenes_creativos_${hoy}${todos ? "_todos" : ""}.xlsx`);
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}`);

  const { students } = await collections();
  const docs = await students.find(todos ? {} : { estado: "validado" }).toArray();
  const filas = docs
    .map((s) => ({ nombre: s.nombrePropuesto ?? s.nombre, correo: s.correoPropuesto ?? s.correo, ciudad: s.ciudad }))
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es"));

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

  mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
  await wb.xlsx.writeFile(salida);

  const porEstado = await students.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$estado", n: { $sum: 1 } } }]).toArray();
  const e = Object.fromEntries(porEstado.map((x) => [x._id, x.n]));
  console.log(`\n${filas.length} filas → ${salida}`);
  console.log(`Estado general: ${e.validado ?? 0} validados · ${e.corregido ?? 0} corregidos por aprobar · ${e.pendiente ?? 0} pendientes`);
  if (!todos && (e.corregido || e.pendiente)) console.log("Los corregidos y pendientes NO están en el archivo.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
