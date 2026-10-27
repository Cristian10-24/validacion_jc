// Colecciones del módulo de testimonios. REGLA: este módulo solo escribe en colecciones con prefijo
// "testimonios_". No usa collections() de @/lib/db (que expone students, users, changeLog…).
// La lectura del usuario de la sesión se hace con getCurrentUser() de @/lib/auth, sin cambios.
import type { Db, ObjectId } from "mongodb";
import { getDb } from "@/lib/db";

export const COLECCIONES = {
  participantes: "testimonios_participantes",
  respuestas: "testimonios_respuestas",
  comentarios: "testimonios_comentarios",
  auditoria: "testimonios_auditoria",
} as const;

export type Participante = {
  _id: ObjectId;
  documento: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  celular: string;          // solo dígitos, tal como vino (sin espacios ni signos)
  celularClave: string | null; // clave de comparación (sin indicativo; ver claveCelular)
  correo: string;
  ciudad: string;
  /** Texto original cuando se aplicó un alias de ciudad (p. ej. "Paysandú" → Uruguay). Informativo. */
  ciudadOriginal?: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
};

export type Cruce = "auto" | "manual" | "sin_duenio" | "conflicto" | "descartada";

export type Respuesta = {
  _id: ObjectId;
  clave: string;                       // idempotencia (índice único)
  recibidaEn: Date;
  marcaTemporal: string;
  fila: number | null;
  original: Record<string, unknown>;   // la respuesta completa tal como llegó
  norm: { nombre: string; documento: string | null; correo: string | null; celular: string | null; ciudad: string; ciudadOriginal?: string | null };
  enlaces: string[];
  participanteId: ObjectId | null;
  cruce: Cruce;
  cruzadoPor?: "documento" | "correo" | "celular" | "manual"; // dato que decidió el cruce (se muestra en el panel)
  candidatos?: ObjectId[];             // en conflicto
  asignacion?: { por: string; en: Date; motivo?: string }; // manual o descartada (motivo: solo al descartar)
};

export type Comentario = { _id: ObjectId; participanteId: ObjectId; texto: string; autor: { usuario: string; nombre: string; rol: string }; fecha: Date };

export type Auditoria = { _id?: ObjectId; accion: string; por: string; fecha: Date; detalle: Record<string, unknown> };

declare global {
  var _testimoniosIndices: Promise<void> | undefined;
}

async function crearIndices(db: Db) {
  // Solo sobre colecciones testimonios_*.
  await Promise.all([
    db.collection(COLECCIONES.participantes).createIndex({ documento: 1 }, { unique: true }),
    db.collection(COLECCIONES.participantes).createIndex({ correo: 1 }),
    db.collection(COLECCIONES.participantes).createIndex({ celularClave: 1 }),
    db.collection(COLECCIONES.participantes).createIndex({ ciudad: 1 }),
    db.collection(COLECCIONES.respuestas).createIndex({ clave: 1 }, { unique: true }),
    db.collection(COLECCIONES.respuestas).createIndex({ participanteId: 1 }),
    db.collection(COLECCIONES.respuestas).createIndex({ cruce: 1 }),
    db.collection(COLECCIONES.comentarios).createIndex({ participanteId: 1, fecha: 1 }),
    db.collection(COLECCIONES.auditoria).createIndex({ fecha: -1 }),
  ]);
}

export async function testimonios() {
  const db = await getDb();
  globalThis._testimoniosIndices ??= crearIndices(db);
  await globalThis._testimoniosIndices;
  return {
    participantes: db.collection<Participante>(COLECCIONES.participantes),
    respuestas: db.collection<Respuesta>(COLECCIONES.respuestas),
    comentarios: db.collection<Comentario>(COLECCIONES.comentarios),
    auditoria: db.collection<Auditoria>(COLECCIONES.auditoria),
  };
}
