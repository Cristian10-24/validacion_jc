// Datos FICTICIOS y base en memoria para las pruebas de clausura (mongodb-memory-server; nunca Atlas).
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { Formulario } from "@/lib/clausura/formulario/esquema";

export const FORM = Formulario.parse({
  secciones: [
    { id: "s_asis", titulo: "Asistencia", items: [
      { id: "q_asiste", tipo: "unica", titulo: "¿Asistirás?", obligatoria: true, opciones: [
        { id: "si", texto: "Sí, asistiré" },
        { id: "no", texto: "No podré ir", irA: { seccion: "s_motivo" } },
      ] },
    ] },
    { id: "s_det", titulo: "Detalles", despues: "enviar", items: [
      { id: "q_acomp", tipo: "sino", titulo: "¿Vienes con acompañantes?", obligatoria: true },
      { id: "q_cuantos", tipo: "numero", titulo: "¿Cuántos?", obligatoria: true, entero: true, min: 1, max: 2, mostrarSi: { pregunta: "q_acomp", op: "=", valor: "si" } },
    ] },
    { id: "s_motivo", titulo: "Motivo", items: [{ id: "q_motivo", tipo: "parrafo", titulo: "¿Por qué?", obligatoria: true }] },
  ],
});

export function evento(slug: string, ciudades: string[], estado: "borrador" | "abierto" | "cerrado" = "abierto", extra: Record<string, unknown> = {}) {
  const ahora = new Date();
  return {
    _id: new ObjectId(), slug, titulo: "Clausura y Expoferia 2026", kicker: "CLAUSURA 2026", nombreVisible: ciudades[0]!, ciudades,
    descripcion: "Te esperamos.", lugar: "Teatro de ejemplo", direccion: "Calle 1 # 2-3", mapaUrl: null,
    inicio: new Date("2026-11-28T21:00:00Z"), fin: null, zonaHoraria: "America/Bogota", zonaHorariaTexto: null, imagen: null,
    estado, fechaLimite: null, permitirEdicion: true, preguntaAsistencia: "q_asiste", formulario: FORM, formularioVersion: 1,
    creadoEn: ahora, actualizadoEn: ahora, actualizadoPor: "prueba", ...extra,
  };
}

export function estudiante(documento: string, ciudad: string, extra: Record<string, unknown> = {}) {
  const ahora = new Date();
  return {
    _id: new ObjectId(), documento, ciudad, grupo: "G1", monitorRef: "", nombreOriginal: "Ana Ruiz", correoOriginal: "anaruiz@gmail.com",
    nombre: "Ana Ruiz", correo: "anaruiz@gmail.com", correoNorm: "anaruiz@gmail.com", estado: "validado", aceptaCorreoPersonal: true,
    creadoEn: ahora, actualizadoEn: ahora, ...extra,
  };
}

export type Base = { db: Db; cerrar: () => Promise<void> };

export async function baseEnMemoria(): Promise<Base> {
  const server = await MongoMemoryServer.create();
  const client = await new MongoClient(server.getUri()).connect();
  const db = client.db("clausura_pruebas");
  return { db, cerrar: async () => { await client.close(); await server.stop(); } };
}
