// Colecciones del módulo "Clausura y Expoferia". REGLA: este módulo solo ESCRIBE en colecciones con prefijo "clausura_".
// Lee `students` (datos validados) y `testimonios_participantes` (celular) SOLO en lectura.
// Única excepción: el límite de intentos fallidos reutiliza src/lib/rateLimit.ts (colección rateLimits).
// No usa collections() de @/lib/db. Lo vigila tests/clausura-seguridad.test.ts.
import type { Binary, Collection, Db, ObjectId } from "mongodb";
import { getDb } from "@/lib/db";
import type { Participante } from "@/lib/testimonios/db";
import type { Student } from "@/lib/types";
import type { Genero } from "./contacto";
import type { Formulario, Respuestas } from "./formulario/esquema";

export const COLECCIONES_CLAUSURA = {
  eventos: "clausura_eventos",
  formularios: "clausura_formularios",
  respuestas: "clausura_respuestas",
  comentarios: "clausura_comentarios",
  auditoria: "clausura_auditoria",
  imagenes: "clausura_imagenes",
} as const;

/** Colecciones de otros módulos que este módulo SOLO lee. */
export const LECTURA_CLAUSURA = { estudiantes: "students", participantes: "testimonios_participantes" } as const;

export const ESTADOS_EVENTO = ["borrador", "abierto", "cerrado"] as const;
export type EstadoEvento = (typeof ESTADOS_EVENTO)[number];

export type Evento = {
  _id: ObjectId;
  /** Identificador en la URL: /clausura/<slug>. Único. */
  slug: string;
  /** "expoferia" = clausura + proyectos · "clausura" = solo la ceremonia. Sin el campo cuenta como "clausura". */
  tipo?: "expoferia" | "clausura";
  titulo: string;
  /** Texto pequeño en mayúsculas sobre el título, p. ej. "CLAUSURA 2026". */
  kicker: string;
  /** Nombre que ve el estudiante ("Paysandú"), aunque en students la ciudad se llame distinto. */
  nombreVisible: string;
  /** Ciudades de students que cubre el evento (valores exactos de students.ciudad). */
  ciudades: string[];
  /** Texto con formato básico (**negrita**, *cursiva*, [enlace](https://…), listas con "- "). */
  descripcion: string;
  lugar: string;
  direccion: string;
  /** Enlace al mapa. Si falta, se arma uno de Google Maps con lugar + dirección. */
  mapaUrl: string | null;
  inicio: Date;
  fin: Date | null;
  /** Hora a la que se cita a los estudiantes (antes del inicio). Es la que va en el calendario. */
  citacion?: Date | null;
  /** Zona horaria IANA del evento (America/Bogota UTC-5, America/Montevideo UTC-3…). */
  zonaHoraria: string;
  /** Texto de la zona para el estudiante ("hora de Colombia"). Si falta, se deduce de zonaHoraria. */
  zonaHorariaTexto: string | null;
  /** Imagen de portada: ruta del sitio (/clausura/cali.webp). */
  imagen: string | null;
  estado: EstadoEvento;
  /** Después de esta fecha no se aceptan respuestas ni ediciones (aunque el evento siga abierto). */
  fechaLimite: Date | null;
  /** ¿Puede editar después de enviar? (mientras siga abierto y antes de la fecha límite) */
  permitirEdicion: boolean;
  /** Id de la pregunta "¿Asistirás?" que usa el panel para contar asistencia. */
  preguntaAsistencia: string | null;
  /** Sección del proyecto: "obligatorio" (aparece y se exige), "opcional" (pregunta antes) o "no". Sin el campo: "no". */
  proyecto?: "obligatorio" | "opcional" | "no";
  /** Opciones de la pregunta de asistencia que cuentan como "asistirá" (calendario y contadores). */
  opcionesAsisten?: string[];
  formulario: Formulario;
  formularioVersion: number;
  creadoEn: Date;
  actualizadoEn: Date;
  actualizadoPor: string;
};

/** Copia de cada versión del formulario: una respuesta siempre se muestra con el texto que vio el estudiante. */
export type VersionFormulario = { _id: ObjectId; eventoId: ObjectId; version: number; formulario: Formulario; guardadoEn: Date; guardadoPor: string };

export type Contacto = {
  /** Correo que se le mostró (oculto) al estudiante, completo, tal como estaba al confirmar. */
  correoMostrado: string;
  correoConfirmado: boolean;
  /** Solo si dijo que ya no usa el correo mostrado. Nunca se escribe en students. */
  correoNuevo: string | null;
  /** Celular prellenado (de testimonios_participantes), completo, si había uno. */
  celularMostrado: string | null;
  /** Celular final (solo dígitos, con indicativo si lo escribió). */
  celular: string;
  /** "prellenado" = confirmó el que se le mostró; "nuevo" = lo escribió o lo cambió. */
  celularOrigen: "prellenado" | "nuevo";
  tieneWhatsApp: boolean;
  /** Solo si su WhatsApp es otro número. */
  whatsapp: string | null;
  /** Género del estudiante ("Tu género"). Opcional en respuestas anteriores a esta pregunta. */
  genero?: Genero;
};

export const ESTADOS_RESPUESTA = ["en_progreso", "enviada"] as const;
export type EstadoRespuesta = (typeof ESTADOS_RESPUESTA)[number];

export type RespuestaClausura = {
  _id: ObjectId;
  eventoId: ObjectId;
  studentId: ObjectId;
  documento: string;
  ciudad: string;
  /** Versión del formulario con que se guardó por última vez. */
  formularioVersion: number;
  estado: EstadoRespuesta;
  /** Dónde va: "contacto", el id de una sección o "resumen". */
  seccionActual: string;
  contacto: Contacto | null;
  /** Solo las preguntas visibles del camino (las de ramas ocultas se descartan al guardar). */
  respuestas: Respuestas;
  iniciadaEn: Date;
  enviadaEn: Date | null;
  /** Última edición después de enviar. */
  editadaEn: Date | null;
  ediciones: number;
  /** El admin la reabrió para que la edite y la vuelva a enviar (se borra al reenviar). */
  reabierta?: { por: string; en: Date } | null;
  /**
   * Edición en curso de una respuesta ya enviada (se autoguarda aquí). Lo enviado no cambia hasta que vuelve a
   * pulsar "Enviar"; si abandona la edición, el panel y el Excel siguen viendo lo enviado.
   */
  borradorEdicion: { contacto: Contacto; respuestas: Respuestas; seccionActual: string; formularioVersion: number; actualizadaEn: Date } | null;
  actualizadaEn: Date;
};

export type ComentarioClausura = {
  _id: ObjectId; eventoId: ObjectId; studentId: ObjectId; texto: string;
  autor: { usuario: string; nombre: string; rol: string }; fecha: Date;
  editadoEn?: Date; editadoPor?: { usuario: string; nombre: string };
};

/** Imagen subida desde el admin (portadas), ya comprimida en el navegador. */
export type ImagenClausura = { _id: ObjectId; tipo: "image/jpeg" | "image/webp" | "image/png"; datos: Binary; bytes: number; subidaPor: string; subidaEn: Date };

export type AuditoriaClausura = { _id?: ObjectId; accion: string; eventoId: ObjectId | null; slug: string; detalle: Record<string, unknown>; por: string; fecha: Date };

declare global {
  var _clausuraIndices: Promise<void> | undefined;
}

async function crearIndices(db: Db) {
  // Solo sobre colecciones clausura_*.
  await Promise.all([
    db.collection(COLECCIONES_CLAUSURA.eventos).createIndex({ slug: 1 }, { unique: true }),
    db.collection(COLECCIONES_CLAUSURA.eventos).createIndex({ estado: 1, ciudades: 1 }),
    db.collection(COLECCIONES_CLAUSURA.formularios).createIndex({ eventoId: 1, version: 1 }, { unique: true }),
    db.collection(COLECCIONES_CLAUSURA.respuestas).createIndex({ eventoId: 1, studentId: 1 }, { unique: true }),
    db.collection(COLECCIONES_CLAUSURA.comentarios).createIndex({ eventoId: 1, studentId: 1, fecha: 1 }),
    db.collection(COLECCIONES_CLAUSURA.auditoria).createIndex({ fecha: -1 }),
  ]);
}

type SoloLectura<T extends object> = Pick<Collection<T>, "find" | "findOne" | "countDocuments" | "distinct">;

export async function clausura() {
  const db = await getDb();
  globalThis._clausuraIndices ??= crearIndices(db);
  await globalThis._clausuraIndices;
  return {
    eventos: db.collection<Evento>(COLECCIONES_CLAUSURA.eventos),
    formularios: db.collection<VersionFormulario>(COLECCIONES_CLAUSURA.formularios),
    respuestas: db.collection<RespuestaClausura>(COLECCIONES_CLAUSURA.respuestas),
    comentarios: db.collection<ComentarioClausura>(COLECCIONES_CLAUSURA.comentarios),
    auditoria: db.collection<AuditoriaClausura>(COLECCIONES_CLAUSURA.auditoria),
    imagenes: db.collection<ImagenClausura>(COLECCIONES_CLAUSURA.imagenes),
    /** Solo lectura. */
    estudiantes: db.collection(LECTURA_CLAUSURA.estudiantes) as unknown as SoloLectura<Student>,
    /** Solo lectura. */
    participantes: db.collection(LECTURA_CLAUSURA.participantes) as unknown as SoloLectura<Participante>,
  };
}
