// Uso: npm run import -- archivo.xlsx [--dry-run] [--eliminar-ausentes]
// Misma lógica que "Subir lista" en la administración (src/lib/importer.ts):
// crea los nuevos y actualiza los pendientes; NUNCA toca validados ni corregidos.
// Los que ya no están en el archivo solo se eliminan con --eliminar-ausentes.
import { readFileSync } from "node:fs";
import path from "node:path";
import { closeDb, dbHost, dbName } from "@/lib/db";
import { readRowsFromBuffer } from "@/lib/excel";
import { aplicar, planificar, type PlanImport } from "@/lib/importer";

function resumen(plan: PlanImport) {
  console.log(`Columnas detectadas: ${plan.columnas.join(", ")}`);
  console.log(`Filas leídas: ${plan.filasLeidas}`);
  console.table({
    nuevos: plan.nuevos.length, conDatosCambiados: plan.cambiados.length, sinCambios: plan.sinCambios,
    protegidos: plan.protegidos.length, yaNoEstanEnLista: plan.ausentes.length, errores: plan.errores.length,
  });
  console.log("Estudiantes por ciudad (así deben escribirse al crear monitores):");
  console.table(Object.fromEntries(Object.entries(plan.ciudades).sort()));
  for (const c of plan.cambiados) console.log(`  Cambia ${c.documento} ${c.nombre}: ${c.cambios.map((x) => `${x.campo} "${x.antes}" → "${x.despues}"`).join("; ")}`);
  for (const c of plan.protegidos) console.log(`  Protegido (${c.estado}) ${c.documento} ${c.nombre}: el archivo trae otros datos, no se toca`);
  for (const a of plan.ausentes) console.log(`  Ya no está en la lista: ${a.documento} ${a.nombre} (${a.ciudad}, ${a.estado})`);
  if (plan.avisos.length) console.log(`\nAvisos (${plan.avisos.length}):\n  ${plan.avisos.map((a) => `Fila ${a.fila} (${a.documento}): ${a.mensaje}`).join("\n  ")}`);
  if (plan.errores.length) console.log(`\nErrores, filas no importadas (${plan.errores.length}):\n  ${plan.errores.map((e) => `Fila ${e.fila}${e.documento ? ` (${e.documento})` : ""}: ${e.mensaje}`).join("\n  ")}`);
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Uso: npm run import -- archivo.xlsx [--dry-run] [--eliminar-ausentes]");
    process.exit(1);
  }
  const rows = await readRowsFromBuffer(readFileSync(file), path.basename(file));
  if (rows.length === 0) throw new Error("No se encontraron filas");
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}`);

  if (args.includes("--dry-run")) {
    console.log("[SIMULACIÓN] No se escribe nada.\n");
    return resumen(await planificar(rows));
  }
  const borrarAusentes = args.includes("--eliminar-ausentes");
  const pre = await planificar(rows);
  const r = await aplicar(rows, borrarAusentes ? pre.ausentes.map((a) => a.id) : [], { rol: "admin", usuario: "script" });
  resumen(r.plan);
  console.log(`\nAplicado: ${r.insertados} nuevos · ${r.actualizados} actualizados · ${r.eliminados} eliminados · ${r.protegidos} protegidos sin tocar`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
