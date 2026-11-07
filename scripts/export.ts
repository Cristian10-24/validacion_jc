// Uso: npm run export [-- archivo.xlsx] [--todos] [--inactivos]
// Excel final para certificados: pestañas "Datos originales" (todos) y "Datos validados".
// Por defecto "Datos validados" trae solo los VALIDADOS (los corregidos entran cuando su monitor los aprueba).
// --todos: "Datos validados" incluye a todos con su dato más reciente (útil para revisar, no para certificar).
// Los estudiantes inactivos no salen; --inactivos los incluye.
// Es el mismo archivo que descarga la administración desde la web.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, collections, dbHost, dbName } from "@/lib/db";
import { datosCertificados, excelCertificados, nombreArchivo } from "@/lib/export";

async function main() {
  const args = process.argv.slice(2);
  const todos = args.includes("--todos");
  const inactivos = args.includes("--inactivos");
  const salida = args.find((a) => !a.startsWith("--")) ?? path.join("exports", nombreArchivo(todos ? "_todos" : ""));
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}`);

  const { students } = await collections();
  const datos = await datosCertificados(students, { soloValidados: !todos, incluirInactivos: inactivos });
  const filas = datos.validados;
  mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
  writeFileSync(salida, await excelCertificados(datos));

  const porEstado = await students.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$estado", n: { $sum: 1 } } }]).toArray();
  const e = Object.fromEntries(porEstado.map((x) => [x._id, x.n]));
  console.log(`\n${filas.length} filas → ${salida}`);
  console.log(`Estado general: ${e.validado ?? 0} validados · ${e.corregido ?? 0} corregidos por aprobar · ${e.pendiente ?? 0} pendientes`);
  if (!todos && (e.corregido || e.pendiente)) console.log("Los corregidos y pendientes NO están en el archivo.");
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
