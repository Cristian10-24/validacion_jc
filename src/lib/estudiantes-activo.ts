// Inactivar / reactivar a una persona. Un solo interruptor: se aplica en students y en testimonios_participantes
// con el mismo documento normalizado (donde exista). Queda en changeLog (students) y en testimonios_auditoria.
// Única escritura de este archivo: los campos activo/inactivo*/reactivado* y los dos registros.
import type { SessionUser } from "./auth";
import { collections } from "./db";
import { testimonios } from "./testimonios/db";
import type { DatosActivo } from "./types";
import { normalizeDocumento } from "./validation/name";

export type CambioActivo = { documento: string; activo: boolean; motivo?: string; user: Pick<SessionUser, "usuario" | "nombre" | "rol"> };
export type ResultadoActivo =
  | { ok: true; activo: boolean; students: number; participantes: number }
  | { ok: false; error: "no_encontrado" | "documento" | "motivo" };

/** Lo que hereda un participante nuevo cuyo documento ya está inactivo en students. */
export type HerenciaInactivo = { inactivoMotivo: string; inactivoEn: Date; inactivoPor: { usuario: string; nombre: string; rol: string } | null };

/** Documentos inactivos en students, con motivo, fecha y autor. Solo lee. */
export async function inactivosEnStudents(): Promise<Map<string, HerenciaInactivo>> {
  const { students } = await collections();
  const filas = await students
    .find({ activo: false }, { projection: { documento: 1, inactivoMotivo: 1, inactivoEn: 1, inactivoPor: 1 } })
    .toArray();
  return new Map(filas.map((s) => [s.documento, {
    inactivoMotivo: s.inactivoMotivo ?? "", inactivoEn: s.inactivoEn ?? new Date(0), inactivoPor: s.inactivoPor ?? null,
  }]));
}

const estadoTxt = (d: DatosActivo) => (d.activo === false ? "inactivo" : "activo");

export async function cambiarActivo({ documento, activo, motivo, user }: CambioActivo): Promise<ResultadoActivo> {
  const doc = normalizeDocumento(documento);
  if (!doc) return { ok: false, error: "documento" };
  const razon = (motivo ?? "").replace(/\s+/g, " ").trim();
  if (!activo && !razon) return { ok: false, error: "motivo" };

  const { students, changeLog } = await collections();
  const { participantes, auditoria } = await testimonios();
  const [st, pa] = await Promise.all([students.findOne({ documento: doc }), participantes.findOne({ documento: doc })]);
  if (!st && !pa) return { ok: false, error: "no_encontrado" };

  const fecha = new Date();
  const por = { usuario: user.usuario, nombre: user.nombre, rol: user.rol };
  const set: DatosActivo = activo
    ? { activo: true, reactivadoEn: fecha, reactivadoPor: por }
    : { activo: false, inactivoMotivo: razon, inactivoEn: fecha, inactivoPor: por };
  // Solo se escribe donde el estado cambia (volver a inactivar no pisa el motivo original).
  const cambia = (d: DatosActivo | null) => !!d && (d.activo === false) === activo;

  let nSt = 0, nPa = 0;
  if (st && cambia(st)) {
    nSt = (await students.updateOne({ _id: st._id }, { $set: set })).modifiedCount;
    await changeLog.insertOne({
      studentId: st._id, documento: st.documento, campo: "activo", anterior: estadoTxt(st), nuevo: activo ? "activo" : "inactivo",
      actor: { rol: user.rol, usuario: user.usuario }, accion: activo ? "activar" : "inactivar", fecha, ...(activo ? {} : { motivo: razon }),
    });
  }
  if (pa && cambia(pa)) {
    nPa = (await participantes.updateOne({ _id: pa._id }, { $set: set })).modifiedCount;
    await auditoria.insertOne({
      accion: activo ? "reactivar_participante" : "inactivar_participante", por: user.usuario, fecha,
      detalle: { participanteId: pa._id, documento: pa.documento, ...(st ? { studentId: st._id } : {}), ...(activo ? {} : { motivo: razon }) },
    });
  }
  return { ok: true, activo, students: nSt, participantes: nPa };
}
