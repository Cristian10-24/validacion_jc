import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { baseEnMemoria, estudiante, evento, type Base } from "./clausura-datos";

// Panel de clausura contra una base EN MEMORIA: permisos (401), alcance por ciudad del monitor (404) y comentarios.
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { db: null as Db | null, token: "" };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (n === "vjc_session" && estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("@/lib/db", () => ({
  getDb: async () => estado.db!,
  collections: async () => ({ users: estado.db!.collection("users"), rateLimits: estado.db!.collection("rateLimits") }),
}));

import { createToken } from "@/lib/auth";
import * as Panel from "@/app/api/clausura/panel/route";
import * as Comentar from "@/app/api/clausura/panel/[studentId]/comentarios/route";
import * as Editar from "@/app/api/clausura/panel/[studentId]/comentarios/[comentarioId]/route";

let base: Base;
const ANA = estudiante("1001", "Cali", { nombre: "Ana Cali" });
const BETO = estudiante("1002", "Cali", { nombre: "Beto Cali" });
const CARO = estudiante("2001", "Cartagena", { nombre: "Caro Cartagena" });
const CALI = evento("cali-2026", ["Cali"]);
const CARTAGENA = evento("cartagena-2026", ["Cartagena"]);
const usuarios = {
  monitorCali: { _id: new ObjectId(), usuario: "m-cali", nombre: "Monitora Cali", rol: "monitor", ciudades: ["Cali"], activo: true, tokenVersion: 0 },
  monitorCtg: { _id: new ObjectId(), usuario: "m-ctg", nombre: "Monitor Cartagena", rol: "monitor", ciudades: ["Cartagena"], activo: true, tokenVersion: 0 },
  coord: { _id: new ObjectId(), usuario: "coord", nombre: "Coordinación", rol: "coordinador", ciudades: [], activo: true, tokenVersion: 0 },
};
const como = (u: { _id: ObjectId } | null) => { estado.token = u ? createToken(u._id.toHexString(), 0) : ""; };
const req = (url: string, metodo = "GET", cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, { method: metodo, headers: { "content-type": "application/json" }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
const panel = async (eventoId?: string) => (await Panel.GET(req(`/api/clausura/panel${eventoId ? `?evento=${eventoId}` : ""}`)));
const comentar = (eventoId: string, studentId: string, texto: string) =>
  Comentar.POST(req(`/api/clausura/panel/${studentId}/comentarios?evento=${eventoId}`, "POST", { texto }), { params: Promise.resolve({ studentId }) });

beforeAll(async () => {
  base = await baseEnMemoria();
  estado.db = base.db;
  await base.db.collection("students").insertMany([ANA, BETO, CARO]);
  await base.db.collection("users").insertMany(Object.values(usuarios));
  await base.db.collection("clausura_eventos").insertMany([CALI, CARTAGENA]);
  const ahora = new Date();
  await base.db.collection("clausura_respuestas").insertMany([
    { _id: new ObjectId(), eventoId: CALI._id, studentId: ANA._id, documento: "1001", ciudad: "Cali", formularioVersion: 1, estado: "enviada", seccionActual: "resumen",
      contacto: { correoMostrado: "anaruiz@gmail.com", correoConfirmado: false, correoNuevo: "ana.nueva@gmail.com", celularMostrado: null, celular: "3001112233", celularOrigen: "nuevo", tieneWhatsApp: true, whatsapp: null },
      respuestas: { q_asiste: "si", q_acomp: "no" }, iniciadaEn: ahora, enviadaEn: ahora, editadaEn: null, ediciones: 0, borradorEdicion: null, actualizadaEn: ahora },
    { _id: new ObjectId(), eventoId: CALI._id, studentId: BETO._id, documento: "1002", ciudad: "Cali", formularioVersion: 1, estado: "en_progreso", seccionActual: "s_asis",
      contacto: null, respuestas: {}, iniciadaEn: ahora, enviadaEn: null, editadaEn: null, ediciones: 0, borradorEdicion: null, actualizadaEn: ahora },
  ]);
});
afterAll(async () => base?.cerrar());

describe("permisos y alcance", () => {
  it("sin sesión: 401 en la lista y en comentarios", async () => {
    como(null);
    expect((await panel()).status).toBe(401);
    expect((await comentar(CALI._id.toHexString(), ANA._id.toHexString(), "hola")).status).toBe(401);
  });

  it("el monitor de Cali ve solo su evento y sus estudiantes, con estado y asistencia", async () => {
    como(usuarios.monitorCali);
    const d = await (await panel()).json();
    expect(d.eventos.map((e: { slug: string }) => e.slug)).toEqual(["cali-2026"]);
    const porDoc = Object.fromEntries(d.filas.map((f: { documento: string }) => [f.documento, f]));
    expect(Object.keys(porDoc).sort()).toEqual(["1001", "1002"]);
    expect(porDoc["1001"]).toMatchObject({ estado: "respondio", asistencia: { id: "si", texto: "Sí, asistiré" }, correo: "ana.nueva@gmail.com", correoCambio: true, celular: "+57 300 111 2233", whatsapp: "Mismo número" });
    expect(porDoc["1002"].estado).toBe("en_progreso");
    expect(d.asistencia.opciones.map((o: { id: string }) => o.id)).toEqual(["si", "no"]);
  });

  it("el monitor de Cali no puede abrir el evento de Cartagena (recibe el suyo)", async () => {
    como(usuarios.monitorCali);
    const d = await (await panel(CARTAGENA._id.toHexString())).json();
    expect(d.evento.slug).toBe("cali-2026");
    expect(d.filas.some((f: { documento: string }) => f.documento === "2001")).toBe(false);
  });

  it("coordinación ve todos los eventos", async () => {
    como(usuarios.coord);
    const d = await (await panel(CARTAGENA._id.toHexString())).json();
    expect(d.eventos).toHaveLength(2);
    expect(d.filas.map((f: { documento: string }) => f.documento)).toEqual(["2001"]);
    expect(d.filas[0].estado).toBe("sin_responder");
  });

  it("comentar a un estudiante de otra ciudad: 404", async () => {
    como(usuarios.monitorCtg);
    expect((await comentar(CALI._id.toHexString(), ANA._id.toHexString(), "hola")).status).toBe(404);
    expect((await comentar(CARTAGENA._id.toHexString(), ANA._id.toHexString(), "hola")).status).toBe(404); // Ana no es de Cartagena
  });
});

describe("comentarios", () => {
  it("crear, editar el propio, y 403 al editar el de otra persona", async () => {
    como(usuarios.monitorCali);
    const r = await comentar(CALI._id.toHexString(), BETO._id.toHexString(), "Le escribí por WhatsApp");
    expect(r.status).toBe(201);
    const { comentario } = await r.json();
    const editar = (texto: string) => Editar.PATCH(req(`/api/clausura/panel/${BETO._id}/comentarios/${comentario.id}?evento=${CALI._id}`, "PATCH", { texto }),
      { params: Promise.resolve({ studentId: BETO._id.toHexString(), comentarioId: comentario.id }) });
    expect((await editar("Confirmó que termina hoy")).status).toBe(200);
    como(usuarios.coord);
    expect((await editar("Cambio ajeno")).status).toBe(403);
    const guardado = await base.db.collection("clausura_comentarios").findOne({ _id: new ObjectId(comentario.id) });
    expect(guardado).toMatchObject({ texto: "Confirmó que termina hoy", autor: { usuario: "m-cali" } });
    const d = await (await panel(CALI._id.toHexString())).json();
    expect(d.filas.find((f: { documento: string }) => f.documento === "1002").comentarios).toHaveLength(1);
  });
});
