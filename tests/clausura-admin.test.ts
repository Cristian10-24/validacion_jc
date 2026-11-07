import ExcelJS from "exceljs";
import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { baseEnMemoria, estudiante, type Base } from "./clausura-datos";

// Administración de la clausura contra una base EN MEMORIA: eventos (crear, editar, abrir/cerrar), portadas,
// avance por ciudad y Excel. Monitor y coordinación: solo lectura (403 al gestionar).
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
import { isoALocal, localAIso } from "@/lib/clausura/gestion";
import * as Eventos from "@/app/api/clausura/eventos/route";
import * as Evento from "@/app/api/clausura/eventos/[id]/route";
import * as Imagenes from "@/app/api/clausura/imagenes/route";
import * as Imagen from "@/app/api/clausura/imagenes/[id]/route";
import * as Resumen from "@/app/api/clausura/resumen/route";
import * as Exportar from "@/app/api/clausura/exportar/route";

let base: Base;
const U = {
  monitor: { _id: new ObjectId(), usuario: "m-cali", nombre: "Monitora", rol: "monitor", ciudades: ["Cali"], activo: true, tokenVersion: 0 },
  coord: { _id: new ObjectId(), usuario: "coord", nombre: "Coordinación", rol: "coordinador", ciudades: [], activo: true, tokenVersion: 0 },
  admin: { _id: new ObjectId(), usuario: "admin", nombre: "Admin", rol: "admin", ciudades: [], activo: true, tokenVersion: 0 },
};
const como = (u: { _id: ObjectId }) => { estado.token = createToken(u._id.toHexString(), 0); };
const json = (url: string, metodo: string, cuerpo?: unknown) =>
  new Request(`http://localhost${url}`, { method: metodo, headers: { "content-type": "application/json" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });

const datos = (extra: Record<string, unknown> = {}) => ({
  slug: "cali-2026", tipo: "expoferia", titulo: "EXPOFeria y clausura 2026", kicker: "EXPOFERIA 2026", nombreVisible: "Cali", ciudades: ["Cali"],
  descripcion: "", lugar: "Universidad Católica", direccion: "Carrera 94 #4c-04", mapaUrl: null, zonaHoraria: "America/Bogota",
  inicio: "2026-11-14T09:00", fin: "2026-11-14T12:00", fechaLimite: "2026-11-12T23:59", imagen: null, permitirEdicion: false, proyecto: "obligatorio", ...extra,
});
const crear = (extra: Record<string, unknown> = {}) => Eventos.POST(json("/api/clausura/eventos", "POST", { ...datos(extra), copiarDe: "plantilla" }));
const cambiar = (id: string, cuerpo: unknown) => Evento.PATCH(json(`/api/clausura/eventos/${id}`, "PATCH", cuerpo), { params: Promise.resolve({ id }) });
const idDe = async (slug: string) => (await base.db.collection("clausura_eventos").findOne({ slug }))!._id.toHexString();

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

beforeAll(async () => {
  base = await baseEnMemoria();
  estado.db = base.db;
  await base.db.collection("users").insertMany(Object.values(U));
  await base.db.collection("students").insertMany([
    estudiante("7001", "Cali", { nombre: "Ana Cali" }), estudiante("7002", "Cali", { nombre: "Beto Cali" }), estudiante("8001", "Cartagena", { nombre: "Caro Ctg" }),
  ]);
});
afterAll(async () => base?.cerrar());

describe("fechas en la zona del evento", () => {
  it("convierte la hora local del evento a ISO con su zona y de vuelta", () => {
    expect(localAIso("2026-11-14T09:00", "America/Bogota")).toBe("2026-11-14T09:00:00-05:00");
    expect(localAIso("2026-11-30T18:00", "America/Montevideo")).toBe("2026-11-30T18:00:00-03:00");
    expect(isoALocal(new Date("2026-11-14T14:00:00Z"), "America/Bogota")).toBe("2026-11-14T09:00");
  });
});

describe("solo el admin gestiona eventos (monitor y coordinación: 403)", () => {
  for (const rol of ["monitor", "coord"] as const) {
    it(`${rol}: crear, editar, abrir, subir portada → 403`, async () => {
      como(U[rol]);
      expect((await crear()).status).toBe(403);
      expect((await cambiar(new ObjectId().toHexString(), { accion: "estado", estado: "abierto" })).status).toBe(403);
      expect((await Imagenes.POST(new Request("http://localhost/x", { method: "POST", body: JPEG }))).status).toBe(403);
    });
  }
  it("sin sesión: 401 en el avance", async () => {
    estado.token = "";
    expect((await Resumen.GET()).status).toBe(401);
  });
});

describe("el admin crea, edita, abre y cierra", () => {
  it("crea el evento en borrador con el formulario estándar", async () => {
    como(U.admin);
    const r = await crear();
    expect(r.status).toBe(201);
    const e = await base.db.collection("clausura_eventos").findOne({ slug: "cali-2026" });
    expect(e).toMatchObject({ estado: "borrador", tipo: "expoferia", proyecto: "obligatorio", permitirEdicion: false, formularioVersion: 1, preguntaAsistencia: "q_asistencia" });
    expect(e!.inicio.toISOString()).toBe("2026-11-14T14:00:00.000Z");
    expect(await base.db.collection("clausura_auditoria").findOne({ accion: "crear", slug: "cali-2026" })).toBeTruthy();
  });
  it("no repite la dirección", async () => {
    como(U.admin);
    expect((await crear()).status).toBe(409);
  });
  it("con datos [POR DEFINIR] se guarda en borrador pero no se puede abrir", async () => {
    como(U.admin);
    expect((await crear({ slug: "cartagena-2026", tipo: "clausura", nombreVisible: "Cartagena", ciudades: ["Cartagena"], lugar: "[POR DEFINIR]", proyecto: "no" })).status).toBe(201);
    const r = await cambiar(await idDe("cartagena-2026"), { accion: "estado", estado: "abierto" });
    expect(r.status).toBe(400);
    expect((await r.json()).errores[0]).toContain("lugar");
  });
  it("edita datos, abre, impide otro abierto en la misma ciudad, permite editar y cierra", async () => {
    como(U.admin);
    const id = await idDe("cali-2026");
    expect((await cambiar(id, { accion: "datos", datos: datos({ lugar: "Universidad Católica Lumen Gentium" }) })).status).toBe(200);
    expect((await cambiar(id, { accion: "estado", estado: "abierto" })).status).toBe(200);
    expect((await crear({ slug: "cali-2026-b", nombreVisible: "Cali" })).status).toBe(201);
    expect((await cambiar(await idDe("cali-2026-b"), { accion: "estado", estado: "abierto" })).status).toBe(409);
    expect((await cambiar(id, { accion: "edicion", permitir: true })).status).toBe(200);
    expect(await base.db.collection("clausura_eventos").findOne({ slug: "cali-2026" })).toMatchObject({ estado: "abierto", permitirEdicion: true, lugar: "Universidad Católica Lumen Gentium" });
    expect((await cambiar(id, { accion: "datos", datos: datos({ slug: "otra" }) })).status).toBe(400); // la dirección no cambia
  });
  it("la lista: el monitor ve solo su ciudad y sin datos de edición; el admin, todo", async () => {
    como(U.monitor);
    const m = await (await Eventos.GET()).json();
    expect(m.puedeGestionar).toBe(false);
    expect(m.eventos.map((e: { slug: string }) => e.slug)).toEqual(["cali-2026"]); // los borradores no los ve
    expect(m.eventos[0].datos).toBeUndefined();
    como(U.admin);
    const a = await (await Eventos.GET()).json();
    expect(a.puedeGestionar).toBe(true);
    expect(a.ciudades).toEqual(["Cali", "Cartagena"]);
    expect(a.eventos).toHaveLength(3);
  });
});

describe("portadas", () => {
  it("sube un JPEG real, lo sirve con caché y rechaza lo que no es imagen", async () => {
    como(U.admin);
    const r = await Imagenes.POST(new Request("http://localhost/x", { method: "POST", body: JPEG }));
    expect(r.status).toBe(201);
    const { ruta } = await r.json();
    const id = ruta.split("/").pop();
    const img = await Imagen.GET(new Request("http://localhost/x"), { params: Promise.resolve({ id }) });
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await img.arrayBuffer()).equals(JPEG)).toBe(true);
    expect((await Imagenes.POST(new Request("http://localhost/x", { method: "POST", body: "<svg>hola</svg>" }))).status).toBe(400);
  });
});

describe("avance y Excel", () => {
  beforeAll(async () => {
    const e = await base.db.collection("clausura_eventos").findOne({ slug: "cali-2026" });
    const ana = await base.db.collection("students").findOne({ documento: "7001" });
    const ahora = new Date();
    await base.db.collection("clausura_respuestas").insertOne({
      _id: new ObjectId(), eventoId: e!._id, studentId: ana!._id, documento: "7001", ciudad: "Cali", formularioVersion: 1, estado: "enviada", seccionActual: "resumen",
      contacto: { correoMostrado: "ana@gmail.com", correoConfirmado: false, correoNuevo: "ana.nueva@gmail.com", celularMostrado: null, celular: "3005556677", celularOrigen: "nuevo", tieneWhatsApp: true, whatsapp: null, genero: "femenino" },
      respuestas: { q_asistencia: "si", q_acompanante: "no", q_proyecto_nombre: "Huerta TIC", q_plan_estudios: "otro", "q_plan_estudios:otro": "Intercambio", q_plan_trabajo: "trabajando", q_monitor_2027: "si", q_comunidad: "si", q_embajador: "no" },
      iniciadaEn: ahora, enviadaEn: ahora, editadaEn: null, ediciones: 0, borradorEdicion: null, reabierta: null, actualizadaEn: ahora,
    });
  });

  it("avance por ciudad: respondieron de cuántos, asistencia y proyecto", async () => {
    como(U.coord);
    const d = await (await Resumen.GET()).json();
    const cali = d.ciudades.find((c: { ciudad: string }) => c.ciudad === "Cali");
    expect(cali).toMatchObject({ total: 2, respondio: 1, sinResponder: 1, presentanProyecto: 1 });
    expect(cali.asistencia.find((a: { id: string }) => a.id === "si").n).toBe(1);
  });

  it("la monitora de Cali ve el avance solo de Cali (nada de Cartagena)", async () => {
    como(U.monitor);
    const d = await (await Resumen.GET()).json();
    expect(d.ciudades.map((c: { ciudad: string }) => c.ciudad)).toEqual(["Cali"]);
    expect(d.total.total).toBe(2);
  });

  it("Excel: una fila por estudiante, columnas por pregunta, Otro, género y hoja Preguntas", async () => {
    como(U.monitor);
    const res = await Exportar.GET(new Request(`http://localhost/api/clausura/exportar?evento=todos&sinResponder=1`));
    expect(res.status).toBe(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await res.arrayBuffer());
    const hoja = libro.getWorksheet("Respuestas")!;
    const enc = (hoja.getRow(1).values as string[]).slice(1);
    expect(enc.slice(0, 4)).toEqual(["Evento", "Ciudad", "Documento", "Nombre"]);
    expect(enc).toContain("Género");
    expect(enc).toContain("Presenta proyecto");
    expect(enc).toContain("Asistiré a la EXPOFeria y clausura el sábado 14 de noviembre a las 9:00 a. m.");
    expect(hoja.rowCount).toBe(3); // encabezado + 2 estudiantes de Cali (el monitor no ve Cartagena)
    const fila = (hoja.getRow(2).values as string[]).slice(1);
    const col = (t: string) => fila[enc.indexOf(t)];
    expect(col("Documento")).toBe("7001");
    expect(col("Género")).toBe("Femenino");
    expect(col("Correo nuevo")).toBe("ana.nueva@gmail.com");
    expect(col("Presenta proyecto")).toBe("Sí");
    expect(col("Pensando en el primer semestre de 2027, ¿cuál de las siguientes opciones describe mejor lo que planeas hacer con tus estudios?")).toBe("Otro: Intercambio");
    expect(libro.getWorksheet("Preguntas")!.rowCount).toBeGreaterThan(10);
  });
});
