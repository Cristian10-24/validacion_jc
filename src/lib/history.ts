import type { Actor, ChangeLog, Student } from "./types";
import { collections } from "./db";

type Cambio = { campo: ChangeLog["campo"]; anterior: string; nuevo: string };

/** Registra los cambios (solo los que realmente cambian). */
export async function logChanges(
  student: Pick<Student, "_id" | "documento">,
  actor: Actor,
  accion: ChangeLog["accion"],
  cambios: Cambio[],
) {
  const fecha = new Date();
  const docs: ChangeLog[] = cambios
    .filter((c) => c.anterior !== c.nuevo)
    .map((c) => ({ studentId: student._id, documento: student.documento, actor, accion, fecha, ...c }));
  if (docs.length === 0) return;
  const { changeLog } = await collections();
  await changeLog.insertMany(docs);
}
