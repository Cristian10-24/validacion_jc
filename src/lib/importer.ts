import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { collections } from "./db";
import type { Actor, ChangeLog, Estado, Student } from "./types";
import { checkEmail } from "./validation/email";
import { cleanSpaces, normalizeCity, normalizeDocumento, toProperName } from "./validation/name";

// Importación de la lista de estudiantes (Excel/CSV). La usan la página "Subir lista" y `npm run import`.
// Reglas:
//  - Nuevos (documento que no existe): se crean como pendientes.
//  - Pendientes con datos distintos: se actualizan.
//  - Validados o corregidos: NUNCA se tocan (se muestran como "protegidos" si el archivo trae otros datos).
//  - Los que están en la base pero no en el archivo ("ausentes"): solo se eliminan si la persona los elige.

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

export type FilaImport = {
  fila: number; documento: string; nombreRaw: string; nombre: string; correoRaw: string; correo: string;
  ciudad: string; grupo: string; monitorRef: string;
};
export type Problema = { fila: number; documento?: string; mensaje: string };
export type Cambio = { campo: "nombre" | "correo" | "ciudad" | "grupo" | "monitorRef"; antes: string; despues: string };
export type Existente = { id: string; documento: string; nombre: string; ciudad: string; estado: Estado };

export type PlanImport = {
  columnas: string[];
  filasLeidas: number;
  nuevos: (FilaImport & { avisos: string[] })[];
  cambiados: (Existente & { fila: number; cambios: Cambio[] })[];
  protegidos: (Existente & { fila: number; cambios: Cambio[] })[];
  ausentes: Existente[];
  sinCambios: number;
  errores: Problema[];
  avisos: Problema[];
  ciudades: Record<string, number>;
};

/** Valida y normaliza las filas del archivo. */
export function leerFilas(rows: Record<string, string>[]) {
  const filas: FilaImport[] = [];
  const errores: Problema[] = [];
  const avisos: Problema[] = [];
  const vistos = new Set<string>();

  rows.forEach((row, i) => {
    const fila = i + 2; // la fila 1 son los encabezados
    const documento = normalizeDocumento(pick(row, "documento"));
    const nombreRaw = cleanSpaces(pick(row, "nombre") || `${pick(row, "nombres")} ${pick(row, "apellidos")}`);
    const correoRaw = pick(row, "correo");
    const ciudad = normalizeCity(pick(row, "ciudad"));

    if (!documento) return errores.push({ fila, mensaje: "Sin número de documento" });
    if (!nombreRaw) return errores.push({ fila, documento, mensaje: "Sin nombre" });
    if (!ciudad) return errores.push({ fila, documento, mensaje: "Sin ciudad" });
    if (vistos.has(documento)) return errores.push({ fila, documento, mensaje: "Documento repetido en el archivo" });
    vistos.add(documento);

    const check = checkEmail(correoRaw);
    if (!correoRaw) avisos.push({ fila, documento, mensaje: "Sin correo" });
    else if (!check.valid) avisos.push({ fila, documento, mensaje: `Correo inválido: ${correoRaw}` });
    else if (check.educational) avisos.push({ fila, documento, mensaje: `Correo educativo: ${check.email}` });
    else if (check.suggestion) avisos.push({ fila, documento, mensaje: `¿Dominio mal escrito? ${check.email} → ${check.suggestion}` });

    filas.push({
      fila, documento, nombreRaw, nombre: toProperName(nombreRaw), correoRaw, correo: check.email, ciudad,
      grupo: cleanSpaces(pick(row, "grupo")), monitorRef: cleanSpaces(pick(row, "monitor")),
    });
  });
  return { filas, errores, avisos };
}

const CAMPOS: Cambio["campo"][] = ["nombre", "correo", "ciudad", "grupo", "monitorRef"];

function diferencias(actual: Student, f: FilaImport): Cambio[] {
  return CAMPOS.filter((c) => (actual[c] ?? "") !== f[c]).map((c) => ({ campo: c, antes: actual[c] ?? "", despues: f[c] }));
}

const existente = (s: Student): Existente => ({ id: s._id.toHexString(), documento: s.documento, nombre: s.nombrePropuesto ?? s.nombre, ciudad: s.ciudad, estado: s.estado });

/** Compara el archivo con la base y arma el plan, sin escribir nada. */
export async function planificar(rows: Record<string, string>[]): Promise<PlanImport> {
  const { filas, errores, avisos } = leerFilas(rows);
  const { students } = await collections();
  const todos = await students.find({}).toArray();
  const porDoc = new Map(todos.map((s) => [s.documento, s]));
  const enArchivo = new Set(filas.map((f) => f.documento));
  const avisosPorFila = new Map<number, string[]>();
  for (const a of avisos) avisosPorFila.set(a.fila, [...(avisosPorFila.get(a.fila) ?? []), a.mensaje]);

  const plan: PlanImport = {
    columnas: Object.keys(rows[0] ?? {}), filasLeidas: rows.length,
    nuevos: [], cambiados: [], protegidos: [], ausentes: [], sinCambios: 0, errores, avisos, ciudades: {},
  };
  for (const f of filas) {
    plan.ciudades[f.ciudad] = (plan.ciudades[f.ciudad] ?? 0) + 1;
    const actual = porDoc.get(f.documento);
    if (!actual) { plan.nuevos.push({ ...f, avisos: avisosPorFila.get(f.fila) ?? [] }); continue; }
    const cambios = diferencias(actual, f);
    if (cambios.length === 0) { plan.sinCambios++; continue; }
    (actual.estado === "pendiente" ? plan.cambiados : plan.protegidos).push({ ...existente(actual), fila: f.fila, cambios });
  }
  plan.ausentes = todos.filter((s) => !enArchivo.has(s.documento)).map(existente).sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es"));
  return plan;
}

export type ResultadoImport = { insertados: number; actualizados: number; eliminados: number; protegidos: number };

/**
 * Aplica el archivo. Vuelve a calcular el plan en este momento (por si alguien validó mientras se revisaba la vista previa)
 * y solo elimina ausentes que sigan ausentes y que estén en `eliminarIds`.
 */
export async function aplicar(rows: Record<string, string>[], eliminarIds: string[], actor: Actor): Promise<ResultadoImport & { plan: PlanImport }> {
  const plan = await planificar(rows);
  const { students, changeLog } = await collections();
  const now = new Date();

  if (plan.nuevos.length) {
    await students.insertMany(plan.nuevos.map((f) => ({
      _id: new ObjectId(), documento: f.documento, ciudad: f.ciudad, grupo: f.grupo, monitorRef: f.monitorRef,
      nombreOriginal: f.nombreRaw, correoOriginal: f.correoRaw, nombre: f.nombre, correo: f.correo, correoNorm: f.correo,
      estado: "pendiente" as const, aceptaCorreoPersonal: false, creadoEn: now, actualizadoEn: now,
    })));
  }

  const filaPorDoc = new Map(rows.length ? leerFilas(rows).filas.map((f) => [f.documento, f]) : []);
  const ops: AnyBulkWriteOperation<Student>[] = plan.cambiados.map((c) => {
    const f = filaPorDoc.get(c.documento)!;
    return {
      updateOne: {
        // Doble seguro: solo se actualiza si sigue pendiente.
        filter: { _id: new ObjectId(c.id), estado: "pendiente" },
        update: { $set: { nombre: f.nombre, correo: f.correo, correoNorm: f.correo, ciudad: f.ciudad, grupo: f.grupo, monitorRef: f.monitorRef, nombreOriginal: f.nombreRaw, correoOriginal: f.correoRaw, actualizadoEn: now } },
      },
    };
  });
  const actualizados = ops.length ? (await students.bulkWrite(ops)).modifiedCount : 0;

  const logs: ChangeLog[] = plan.cambiados.flatMap((c) =>
    c.cambios.filter((x) => x.campo === "nombre" || x.campo === "correo").map((x) => ({
      studentId: new ObjectId(c.id), documento: c.documento, campo: x.campo as "nombre" | "correo",
      anterior: x.antes, nuevo: x.despues, actor, accion: "importar" as const, fecha: now,
    })),
  );

  const ausentesIds = new Set(plan.ausentes.map((a) => a.id));
  const borrar = [...new Set(eliminarIds)].filter((id) => ausentesIds.has(id));
  let eliminados = 0;
  if (borrar.length) {
    eliminados = (await students.deleteMany({ _id: { $in: borrar.map((id) => new ObjectId(id)) } })).deletedCount;
    for (const a of plan.ausentes.filter((x) => borrar.includes(x.id)))
      logs.push({ studentId: new ObjectId(a.id), documento: a.documento, campo: "estado", anterior: a.estado, nuevo: "eliminado", actor, accion: "eliminar", fecha: now });
  }
  if (logs.length) await changeLog.insertMany(logs);

  return { plan, insertados: plan.nuevos.length, actualizados, eliminados, protegidos: plan.protegidos.length };
}
