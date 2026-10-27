import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { planRecruce } from "@/lib/testimonios/recruce";

// "Sin dueño": asignar y descartar con auditoría, contra una base EN MEMORIA (sin Mongo).
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("@/lib/db", () => ({ collections: async () => ({ users: { findOne: async () => estado.usuario } }), getDb: () => { throw new Error("no"); } }));

type Doc = Record<string, unknown>;
const mem = vi.hoisted(() => ({ participantes: [] as Doc[], respuestas: [] as Doc[], auditoria: [] as Doc[] }));
vi.mock("@/lib/testimonios/db", () => {
  const cumple = (d: Doc, q: Doc) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === "object" && "$in" in (v as object)) return (v as { $in: unknown[] }).$in.some((y) => String(y) === String(d[k]));
    return String(d[k]) === String(v);
  });
  const col = (arr: Doc[]) => ({
    find: (q: Doc = {}) => ({ toArray: async () => arr.filter((d) => cumple(d, q)) }),
    findOne: async (q: Doc) => arr.find((d) => cumple(d, q)) ?? null,
    insertOne: async (d: Doc) => { arr.push(d); },
    updateOne: async (q: Doc, u: { $set?: Doc; $unset?: Doc }) => {
      const d = arr.find((x) => cumple(x, q));
      if (!d) return { matchedCount: 0, modifiedCount: 0 };
      Object.assign(d, u.$set ?? {});
      for (const k of Object.keys(u.$unset ?? {})) delete d[k];
      return { matchedCount: 1, modifiedCount: 1 };
    },
  });
  return { testimonios: async () => ({ participantes: col(mem.participantes), respuestas: col(mem.respuestas), auditoria: col(mem.auditoria) }) };
});

async function comoAdmin() {
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: "admin-prueba", nombre: "Admin", rol: "admin", ciudades: [], activo: true, tokenVersion: 0 };
  estado.token = createToken(_id.toHexString(), 0);
}
const accion = async (id: string, body: unknown) => {
  const { POST } = await import("@/app/api/admin/testimonios/respuestas/[id]/route");
  const r = await POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  return { status: r.status, data: await r.json() };
};
const respuesta = (id: ObjectId) => mem.respuestas.find((r) => (r._id as ObjectId).equals(id))!;

const MARIANA = new ObjectId(), MATEO = new ObjectId();
const SIN = new ObjectId(), CONF = new ObjectId();
const norm = (nombre: string, correo: string | null, documento: string | null = null) => ({ nombre, documento, correo, celular: null, ciudad: "Bogotá D.C." });

beforeEach(async () => {
  mem.participantes.length = mem.respuestas.length = mem.auditoria.length = 0;
  mem.participantes.push(
    { _id: MARIANA, documento: "1003", nombre: "Mariana Martínez Cano", ciudad: "Bogotá D.C.", correo: "familia@gmail.com", celular: "3007778899", celularClave: "3007778899" },
    { _id: MATEO, documento: "1004", nombre: "Mateo Martínez Cano", ciudad: "Bogotá D.C.", correo: "familia@gmail.com", celular: "3001231234", celularClave: "3001231234" },
  );
  mem.respuestas.push(
    { _id: SIN, cruce: "sin_duenio", participanteId: null, marcaTemporal: "24/10/2026 10:00:00", recibidaEn: new Date(), fila: 7, original: {}, norm: norm("Pedro X", "pedro@gmail.com", "9999"), enlaces: ["https://drive.google.com/a"] },
    { _id: CONF, cruce: "conflicto", participanteId: null, candidatos: [MARIANA, MATEO], marcaTemporal: "23/10/2026 16:45:00", recibidaEn: new Date(), fila: 6, original: {}, norm: norm("Martínez", "familia@gmail.com"), enlaces: ["https://drive.google.com/b"] },
  );
  await comoAdmin();
});

describe("vista Sin dueño", () => {
  it("lista sin dueño y conflictos (más reciente primero) con los candidatos completos", async () => {
    const { GET } = await import("@/app/api/admin/testimonios/sin-duenio/route");
    const data = await (await GET()).json();
    expect(data.respuestas.map((r: { cruce: string }) => r.cruce)).toEqual(["sin_duenio", "conflicto"]);
    expect(data.respuestas[1].candidatos.map((c: { nombre: string }) => c.nombre)).toEqual(["Mariana Martínez Cano", "Mateo Martínez Cano"]);
    expect(data.participantes).toHaveLength(2);
  });
});

describe("asignar", () => {
  it("un conflicto asignado a un candidato queda manual, sin candidatos y en la auditoría", async () => {
    const r = await accion(CONF.toHexString(), { accion: "asignar", participanteId: MATEO.toHexString() });
    expect(r.status).toBe(200);
    expect(respuesta(CONF)).toMatchObject({ cruce: "manual", participanteId: MATEO, cruzadoPor: "manual", asignacion: { por: "admin-prueba" } });
    expect(respuesta(CONF).candidatos).toBeUndefined();
    expect(mem.auditoria).toEqual([expect.objectContaining({
      accion: "asignar_respuesta", por: "admin-prueba",
      detalle: expect.objectContaining({ respuestaId: CONF.toHexString(), participanteId: MATEO.toHexString(), cruceAnterior: "conflicto", candidatos: [MARIANA.toHexString(), MATEO.toHexString()] }),
    })]);
  });
  it("el re-cruce respeta la asignación manual", async () => {
    await accion(SIN.toHexString(), { accion: "asignar", participanteId: MARIANA.toHexString() });
    const claves = mem.participantes.map((p) => ({ id: (p._id as ObjectId).toHexString(), documento: p.documento as string, correo: p.correo as string, celular: p.celularClave as string }));
    expect(planRecruce(mem.respuestas as never, claves)).toEqual([]);
  });
  it("participante inexistente → 404 y no cambia nada", async () => {
    const r = await accion(SIN.toHexString(), { accion: "asignar", participanteId: new ObjectId().toHexString() });
    expect(r.status).toBe(404);
    expect(respuesta(SIN).cruce).toBe("sin_duenio");
    expect(mem.auditoria).toHaveLength(0);
  });
  it("una descartada se puede asignar después", async () => {
    await accion(SIN.toHexString(), { accion: "descartar" });
    expect((await accion(SIN.toHexString(), { accion: "asignar", participanteId: MARIANA.toHexString() })).status).toBe(200);
    expect(respuesta(SIN)).toMatchObject({ cruce: "manual", participanteId: MARIANA });
  });
});

describe("descartar", () => {
  it("queda descartada, sin dueño, con motivo, y en la auditoría", async () => {
    const r = await accion(SIN.toHexString(), { accion: "descartar", motivo: "  Envío   de prueba " });
    expect(r.status).toBe(200);
    expect(respuesta(SIN)).toMatchObject({ cruce: "descartada", participanteId: null, asignacion: { por: "admin-prueba", motivo: "Envío de prueba" } });
    expect(mem.auditoria[0]).toMatchObject({ accion: "descartar_respuesta", detalle: { respuestaId: SIN.toHexString(), cruceAnterior: "sin_duenio", motivo: "Envío de prueba" } });
  });
  it("no se puede descartar una respuesta que ya tiene dueño (409)", async () => {
    await accion(CONF.toHexString(), { accion: "asignar", participanteId: MARIANA.toHexString() });
    const r = await accion(CONF.toHexString(), { accion: "descartar" });
    expect(r.status).toBe(409);
    expect(respuesta(CONF).cruce).toBe("manual");
    expect(mem.auditoria).toHaveLength(1);
  });
  it("respuesta inexistente → 404; cuerpo inválido → 400", async () => {
    expect((await accion(new ObjectId().toHexString(), { accion: "descartar" })).status).toBe(404);
    expect((await accion(SIN.toHexString(), { accion: "borrar" })).status).toBe(400);
    expect((await accion("no-es-un-id", { accion: "descartar" })).status).toBe(400);
  });
});
