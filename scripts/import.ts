// Uso: npm run import -- archivo.xlsx [--dry-run]
// Inserta estudiantes nuevos y actualiza los pendientes. Nunca pisa registros validados
// ni el nombre/correo de los corregidos (solo ciudad, grupo y monitor).
import { ObjectId } from "mongodb";
import { closeDb, collections, dbHost, dbName } from "@/lib/db";
import { checkEmail } from "@/lib/validation/email";
import { cleanSpaces, normalizeCity, normalizeDocumento, toProperName } from "@/lib/validation/name";
import { readRows } from "./excel";

// Nombres de columna aceptados (ya normalizados: minúsculas, sin tildes).
const COLUMNAS = {
  ciudad: ["ciudad", "municipio"],
  grupo: ["grupo", "curso", "cohorte"],
  documento: ["documento", "id", "numero de documento", "no documento", "n documento", "cedula", "identificacion", "doc", "tarjeta de identidad"],
  nombre: ["nombre", "nombre completo", "nombres y apellidos", "estudiante"],
  nombres: ["nombres"],
  apellidos: ["apellidos"],
  correo: ["correo", "email", "e mail", "correo electronico", "correo personal"],
  monitor: ["monitor", "monitora", "docente", "tutor"],
} as const;

function pick(row: Record<string, string>, campo: keyof typeof COLUMNAS): string {
  for (const key of COLUMNAS[campo]) if (row[key]) return row[key];
  return "";
}

async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!file) {
    console.error("Uso: npm run import -- archivo.xlsx [--dry-run]");
    process.exit(1);
  }

  const rows = await readRows(file);
  if (rows.length === 0) throw new Error("No se encontraron filas");
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}`);
  console.log(`Columnas detectadas: ${Object.keys(rows[0]).join(", ")}`);

  const { students } = await collections();
  const vistos = new Set<string>();
  const errores: string[] = [];
  const avisos: string[] = [];
  const stats = { nuevos: 0, actualizados: 0, soloUbicacion: 0, sinCambios: 0, omitidosValidados: 0 };
  const ciudades = new Map<string, number>();

  for (const [i, row] of rows.entries()) {
    const fila = i + 2;
    const documento = normalizeDocumento(pick(row, "documento"));
    const nombreRaw = cleanSpaces(pick(row, "nombre") || `${pick(row, "nombres")} ${pick(row, "apellidos")}`);
    const correoRaw = pick(row, "correo");
    const ciudad = normalizeCity(pick(row, "ciudad"));

    if (!documento) { errores.push(`Fila ${fila}: sin documento`); continue; }
    if (!nombreRaw) { errores.push(`Fila ${fila} (${documento}): sin nombre`); continue; }
    if (!ciudad) { errores.push(`Fila ${fila} (${documento}): sin ciudad`); continue; }
    if (vistos.has(documento)) { errores.push(`Fila ${fila}: documento ${documento} repetido en el archivo`); continue; }
    vistos.add(documento);

    const check = checkEmail(correoRaw);
    if (correoRaw && !check.valid) avisos.push(`Fila ${fila} (${documento}): correo inválido "${correoRaw}"`);
    else if (check.educational) avisos.push(`Fila ${fila} (${documento}): correo educativo ${check.email}`);
    else if (check.suggestion) avisos.push(`Fila ${fila} (${documento}): ¿dominio mal escrito? ${check.email} → ${check.suggestion}`);
    else if (!correoRaw) avisos.push(`Fila ${fila} (${documento}): sin correo`);

    ciudades.set(ciudad, (ciudades.get(ciudad) ?? 0) + 1);
    const ubicacion = { ciudad, grupo: cleanSpaces(pick(row, "grupo")), monitorRef: cleanSpaces(pick(row, "monitor")) };
    const datos = { nombre: toProperName(nombreRaw), correo: check.email, correoNorm: check.email };
    const now = new Date();

    const existing = await students.findOne({ documento });
    if (!existing) {
      stats.nuevos++;
      if (!dryRun)
        await students.insertOne({
          _id: new ObjectId(), documento, ...ubicacion, ...datos,
          nombreOriginal: nombreRaw, correoOriginal: correoRaw,
          estado: "pendiente", aceptaCorreoPersonal: false, creadoEn: now, actualizadoEn: now,
        });
      continue;
    }
    if (existing.estado === "validado") { stats.omitidosValidados++; continue; }

    const set = existing.estado === "corregido" ? ubicacion : { ...ubicacion, ...datos, nombreOriginal: nombreRaw, correoOriginal: correoRaw };
    const changed = Object.entries(set).some(([k, v]) => existing[k as keyof typeof existing] !== v);
    if (!changed) { stats.sinCambios++; continue; }
    existing.estado === "corregido" ? stats.soloUbicacion++ : stats.actualizados++;
    if (!dryRun) await students.updateOne({ _id: existing._id }, { $set: { ...set, actualizadoEn: now } });
  }

  console.log(`\n${dryRun ? "[SIMULACIÓN] " : ""}Filas leídas: ${rows.length}`);
  console.table(stats);
  console.log("Estudiantes por ciudad (así deben escribirse al crear monitores):");
  console.table(Object.fromEntries([...ciudades].sort()));
  if (avisos.length) console.log(`\nAvisos (${avisos.length}):\n  ${avisos.join("\n  ")}`);
  if (errores.length) console.log(`\nErrores, filas no importadas (${errores.length}):\n  ${errores.join("\n  ")}`);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
