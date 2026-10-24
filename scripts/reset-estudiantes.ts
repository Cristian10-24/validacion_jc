// Deja estudiantes como recién importados (por ejemplo, después de pruebas).
//
// Uso:
//   npm run reset-estudiantes -- --buscar                    Lista a quienes tocó el rol estudiante (solo lectura)
//   npm run reset-estudiantes -- doc1 doc2 --dry-run         Muestra qué cambiaría, sin escribir
//   npm run reset-estudiantes -- doc1 doc2                   Aplica
//
// Al aplicar, para cada documento:
//   - estado: pendiente
//   - nombre y correo: los originales de la importación (nombreOriginal, correoOriginal),
//     con la misma normalización que hace la importación (Nombre Propio, correo en minúsculas)
//   - se borran nombrePropuesto, correoPropuesto, aceptaCorreoPersonal, validadoPor y validadoEn
//   - se borra su historial en changeLog, excepto los registros de importación
import type { ObjectId } from "mongodb";
import { closeDb, collections, dbHost, dbName } from "@/lib/db";
import type { Student } from "@/lib/types";
import { checkEmail } from "@/lib/validation/email";
import { normalizeDocumento, toProperName } from "@/lib/validation/name";

const fecha = (d?: Date) => (d ? d.toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—");

async function buscar() {
  const { students, changeLog } = await collections();
  // Quien tenga alguna acción del rol estudiante en el historial, o un estado que venga del estudiante.
  const ids: ObjectId[] = await changeLog.distinct("studentId", { "actor.rol": "estudiante" });
  const tocados = await students
    .find({ $or: [{ _id: { $in: ids } }, { "validadoPor.rol": "estudiante" }, { estado: "corregido" }] })
    .sort({ ciudad: 1, nombre: 1 })
    .toArray();
  const acciones = new Map<string, string[]>();
  for (const h of await changeLog.find({ studentId: { $in: tocados.map((s) => s._id) } }).sort({ fecha: 1 }).toArray()) {
    const k = h.studentId.toHexString();
    const txt = `${h.accion}(${h.actor.rol}${h.actor.usuario ? ":" + h.actor.usuario : ""})`;
    const lista = acciones.get(k) ?? [];
    if (!lista.includes(txt)) lista.push(txt);
    acciones.set(k, lista);
  }
  console.table(tocados.map((s) => ({
    documento: s.documento, nombre: s.nombre, ciudad: s.ciudad, estado: s.estado,
    validadoPor: s.validadoPor ? `${s.validadoPor.rol}${s.validadoPor.usuario ? ":" + s.validadoPor.usuario : ""}` : "—",
    fecha: fecha(s.validadoEn ?? s.actualizadoEn), historial: (acciones.get(s._id.toHexString()) ?? []).join(", "),
  })));
  console.log(`${tocados.length} estudiantes. Para limpiarlos: npm run reset-estudiantes -- ${tocados.map((s) => s.documento).join(" ")} --dry-run`);
}

function plan(s: Student) {
  const correo = checkEmail(s.correoOriginal ?? "").email;
  return { nombre: toProperName(s.nombreOriginal ?? s.nombre), correo };
}

async function reset(docs: string[], dryRun: boolean) {
  const { students, changeLog } = await collections();
  const documentos = [...new Set(docs.map(normalizeDocumento).filter(Boolean))];
  const encontrados = await students.find({ documento: { $in: documentos } }).toArray();
  const faltan = documentos.filter((d) => !encontrados.some((s) => s.documento === d));
  if (faltan.length) console.log(`⚠ No existen: ${faltan.join(", ")}`);
  if (!encontrados.length) return;

  const historial = await changeLog.aggregate<{ _id: ObjectId; n: number }>([
    { $match: { studentId: { $in: encontrados.map((s) => s._id) }, accion: { $ne: "importar" } } },
    { $group: { _id: "$studentId", n: { $sum: 1 } } },
  ]).toArray();
  const nHist = new Map(historial.map((h) => [h._id.toHexString(), h.n]));

  console.table(encontrados.map((s) => {
    const p = plan(s);
    return {
      documento: s.documento,
      estado: `${s.estado} → pendiente`,
      nombre: s.nombre === p.nombre && !s.nombrePropuesto ? p.nombre : `${s.nombrePropuesto ?? s.nombre} → ${p.nombre}`,
      correo: s.correo === p.correo && !s.correoPropuesto ? p.correo : `${s.correoPropuesto ?? s.correo} → ${p.correo}`,
      historialABorrar: nHist.get(s._id.toHexString()) ?? 0,
    };
  }));
  if (dryRun) return console.log("[SIMULACIÓN] No se escribió nada. Quita --dry-run para aplicar.");

  const now = new Date();
  for (const s of encontrados) {
    const p = plan(s);
    await students.updateOne(
      { _id: s._id },
      {
        $set: { estado: "pendiente", nombre: p.nombre, correo: p.correo, correoNorm: p.correo, actualizadoEn: now },
        $unset: { nombrePropuesto: "", correoPropuesto: "", aceptaCorreoPersonal: "", validadoPor: "", validadoEn: "" },
      },
    );
  }
  const borrados = await changeLog.deleteMany({ studentId: { $in: encontrados.map((s) => s._id) }, accion: { $ne: "importar" } });
  console.log(`Listo: ${encontrados.length} estudiantes como recién importados · ${borrados.deletedCount} registros de historial borrados (se conservan los de importación).`);
}

async function main() {
  const args = process.argv.slice(2);
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}`);
  if (args.includes("--buscar")) return buscar();
  const docs = args.filter((a) => !a.startsWith("--"));
  if (!docs.length) {
    console.error("Uso: npm run reset-estudiantes -- --buscar | doc1 doc2 [--dry-run]");
    process.exit(1);
  }
  await reset(docs, args.includes("--dry-run"));
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
