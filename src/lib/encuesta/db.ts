// Colecciones del módulo "Encuesta final". REGLA: este módulo solo ESCRIBE en colecciones con prefijo "encuesta_".
// La lista de participantes es la del módulo de testimonios (testimonios_participantes) y aquí SOLO se lee.
// No usa collections() de @/lib/db (students, users, changeLog…). Lo vigila tests/encuesta-seguridad.test.ts.
import type { Collection, Db, ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import type { Participante } from "@/lib/testimonios/db";

export const COLECCIONES_ENCUESTA = {
  respuestas: "encuesta_respuestas",
  comentarios: "encuesta_comentarios",
} as const;

/** Lista de participantes compartida con testimonios. Solo lectura desde este módulo. */
export const PARTICIPANTES_LECTURA = "testimonios_participantes";

export type RespuestaEncuesta = {
  _id: ObjectId;
  clave: string;                        // idempotencia (índice único)
  recibidaEn: Date;
  marcaTemporal: string;
  fila: number | null;
  original: Record<string, unknown>;    // la respuesta tal como llegó (solo las columnas que envía el Apps Script)
  norm: { nombre: string; documento: string | null; correo: string | null; ciudad: string };
};

export type ComentarioEncuesta = {
  _id: ObjectId; participanteId: ObjectId; texto: string; autor: { usuario: string; nombre: string; rol: string }; fecha: Date;
  /** Solo si el autor lo editó. No se guarda el texto anterior. */
  editadoEn?: Date; editadoPor?: { usuario: string; nombre: string };
};

/** Participante con solo lo que este módulo lee. */
export type ParticipanteLectura = Pick<Participante, "_id" | "documento" | "nombre" | "correo" | "celular" | "ciudad" | "ciudadOriginal" | "activo" | "inactivoMotivo" | "inactivoEn" | "inactivoPor">;

declare global {
  var _encuestaIndices: Promise<void> | undefined;
}

async function crearIndices(db: Db) {
  // Solo sobre colecciones encuesta_*.
  await Promise.all([
    db.collection(COLECCIONES_ENCUESTA.respuestas).createIndex({ clave: 1 }, { unique: true }),
    db.collection(COLECCIONES_ENCUESTA.comentarios).createIndex({ participanteId: 1, fecha: 1 }),
  ]);
}

export async function encuesta() {
  const db = await getDb();
  globalThis._encuestaIndices ??= crearIndices(db);
  await globalThis._encuestaIndices;
  return {
    respuestas: db.collection<RespuestaEncuesta>(COLECCIONES_ENCUESTA.respuestas),
    comentarios: db.collection<ComentarioEncuesta>(COLECCIONES_ENCUESTA.comentarios),
    /** Solo lectura: find / findOne / countDocuments. */
    participantes: db.collection(PARTICIPANTES_LECTURA) as unknown as Pick<Collection<Participante>, "find" | "findOne" | "countDocuments">,
  };
}
