import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Alcance por ciudad validado en el servidor, con una base EN MEMORIA (sin Mongo).
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("@/lib/db", () => ({ collections: async () => ({ users: { findOne: async () => estado.usuario } }), getDb: () => { throw new Error("no"); } }));

const mem = vi.hoisted(() => ({ participantes: [] as Record<string, unknown>[], respuestas: [] as Record<string, unknown>[], comentarios: [] as Record<string, unknown>[] }));
vi.mock("@/lib/testimonios/db", () => {
  const cumple = (d: Record<string, unknown>, q: Record<string, unknown>) => Object.entries(q).every(([k, v]) => {
    const x = d[k];
    if (v && typeof v === "object" && "$in" in (v as object)) return ((v as { $in: unknown[] }).$in).some((y) => String(y) === String(x));
    return String(x) === String(v);
  });
  const col = (arr: Record<string, unknown>[]) => ({
    find: (q: Record<string, unknown> = {}) => { const r = arr.filter((d) => cumple(d, q)); const cur = { toArray: async () => r, sort: () => cur }; return cur; },
    findOne: async (q: Record<string, unknown>) => arr.find((d) => cumple(d, q)) ?? null,
    insertOne: async (d: Record<string, unknown>) => { arr.push(d); },
    countDocuments: async (q: Record<string, unknown> = {}) => arr.filter((d) => cumple(d, q)).length,
  });
  return { testimonios: async () => ({ participantes: col(mem.participantes), respuestas: col(mem.respuestas), comentarios: col(mem.comentarios) }) };
});

vi.mock("@/lib/testimonios/usuarios-lectura", () => ({ monitoresPorCiudad: async () => new Map([["Cali", ["Monitora Cali"]]]) }));

const CALI = new ObjectId(), MEDE = new ObjectId();
async function como(rol: "monitor" | "coordinador" | "admin" | null, ciudades: string[] = []) {
  if (!rol) { estado.token = ""; estado.usuario = null; return; }
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: `u-${rol}`, nombre: `Usuario ${rol}`, rol, ciudades, activo: true, tokenVersion: 0 };
  estado.token = createToken(_id.toHexString(), 0);
}
const listar = async () => { const { GET } = await import("@/app/api/testimonios/route"); const r = await GET(); return { status: r.status, data: await r.json() }; };
const comentar = async (id: string, texto: string) => {
  const { POST } = await import("@/app/api/testimonios/[id]/comentarios/route");
  const r = await POST(new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) }), { params: Promise.resolve({ id }) });
  return { status: r.status, data: await r.json() };
};

beforeEach(() => {
  mem.participantes.length = mem.respuestas.length = mem.comentarios.length = 0;
  mem.participantes.push(
    { _id: CALI, documento: "1", nombre: "Ana Cali", ciudad: "Cali", celular: "3001112233", correo: "ana@gmail.com" },
    { _id: MEDE, documento: "2", nombre: "Beto Medellín", ciudad: "Medellín", celular: "", correo: "" },
  );
  mem.respuestas.push({ _id: new ObjectId(), participanteId: CALI, cruce: "auto", marcaTemporal: "20/10/2026 9:00:00", recibidaEn: new Date(), enlaces: ["https://drive.google.com/x"], cruzadoPor: "documento" });
});

describe("vista Testimonios: alcance por ciudad (servidor)", () => {
  it("el monitor de Cali solo ve Cali", async () => {
    await como("monitor", ["Cali"]);
    const r = await listar();
    expect(r.status).toBe(200);
    expect(r.data.filas.map((f: { nombre: string }) => f.nombre)).toEqual(["Ana Cali"]);
    expect(r.data.filas[0]).toMatchObject({ estado: "realizado", envios: [{ cruzadoPor: "documento", enlaces: ["https://drive.google.com/x"] }] });
  });
  it("el coordinador ve todas las ciudades", async () => {
    await como("coordinador");
    expect((await listar()).data.filas.map((f: { nombre: string }) => f.nombre).sort()).toEqual(["Ana Cali", "Beto Medellín"]);
  });
  it("sin sesión → 401", async () => { await como(null); expect((await listar()).status).toBe(401); });
});

describe("comentarios", () => {
  it("el monitor comenta en su ciudad y queda con autor y fecha; el pendiente pasa a seguimiento", async () => {
    await como("monitor", ["Medellín"]);
    const r = await comentar(MEDE.toHexString(), "  Lo llamé,   dijo que lo envía el viernes. ");
    expect(r.status).toBe(201);
    expect(r.data.comentario).toMatchObject({ texto: "Lo llamé, dijo que lo envía el viernes.", autor: { usuario: "u-monitor", rol: "monitor" } });
    expect((await listar()).data.filas[0]).toMatchObject({ nombre: "Beto Medellín", estado: "seguimiento" });
  });
  it("el monitor NO puede comentar a un participante de otra ciudad (404) y no se guarda nada", async () => {
    await como("monitor", ["Cali"]);
    expect((await comentar(MEDE.toHexString(), "hola")).status).toBe(404);
    expect(mem.comentarios).toHaveLength(0);
  });
  it("comentario vacío o demasiado largo → 400", async () => {
    await como("admin");
    expect((await comentar(CALI.toHexString(), "   ")).status).toBe(400);
    expect((await comentar(CALI.toHexString(), "x".repeat(1001))).status).toBe(400);
  });
});

// ---------- Excel de pendientes: alcance por ciudad en el servidor ----------
const exportar = async (ciudad?: string) => {
  const { GET } = await import("@/app/api/testimonios/exportar-pendientes/route");
  const r = await GET(new Request(`http://localhost/api/testimonios/exportar-pendientes${ciudad ? `?ciudad=${encodeURIComponent(ciudad)}` : ""}`));
  return r;
};
async function leerExcel(r: Response) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await r.arrayBuffer());
  const ws = wb.getWorksheet("Pendientes")!;
  return ws.getSheetValues().slice(1).map((fila) => (fila as unknown[]).slice(1));
}

describe("exportar pendientes (Excel)", () => {
  beforeEach(() => {
    mem.participantes.push(
      { _id: new ObjectId(), documento: "3", nombre: "Carla Cali", ciudad: "Cali", celular: "3105550033", correo: "carla@gmail.com" },
      { _id: new ObjectId(), documento: "4", nombre: "Diego Medellín", ciudad: "Medellín", celular: "3006667788", correo: "diego@gmail.com" },
    );
  });
  it("el monitor NO puede exportar pendientes de otra ciudad (403)", async () => {
    await como("monitor", ["Cali"]);
    const r = await exportar("Medellín");
    expect(r.status).toBe(403);
    expect(r.headers.get("Content-Type")).not.toContain("spreadsheet");
  });
  it("el monitor sin filtro solo recibe los pendientes de sus ciudades", async () => {
    await como("monitor", ["Cali"]);
    const r = await exportar();
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Filas")).toBe("1");
    expect(await leerExcel(r)).toEqual([
      ["Nombre completo", "Celular", "Correo", "Documento", "Ciudad", "Estado", "Último comentario"],
      ["Carla Cali", "+57 310 555 0033", "carla@gmail.com", "3", "Cali", "Pendiente", ""],
    ]);
  });
  it("con ciudad filtrada exporta solo esa ciudad, con su nombre de archivo", async () => {
    await como("coordinador");
    const r = await exportar("Medellín");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toMatch(/filename="pendientes_testimonios_Medellin_\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect((await leerExcel(r)).slice(1).map((f) => f[0])).toEqual(["Beto Medellín", "Diego Medellín"]);
  });
  it("incluye Seguimiento con su estado y el último comentario con fecha (Pendiente primero)", async () => {
    const diego = mem.participantes.find((p) => p.nombre === "Diego Medellín")!._id;
    const autor = { usuario: "m", nombre: "Monitora Medellín", rol: "monitor" };
    mem.comentarios.push(
      { _id: new ObjectId(), participanteId: diego, texto: "No contesta.", autor, fecha: new Date("2026-10-24T14:00:00Z") },
      { _id: new ObjectId(), participanteId: diego, texto: "Lo envía\nel viernes.", autor, fecha: new Date("2026-10-25T21:30:00Z") },
    );
    await como("monitor", ["Medellín"]);
    const filas = (await leerExcel(await exportar("Medellín"))).slice(1);
    expect(filas.map((f) => [f[0], f[5], String(f[6] ?? "").replace(/\s/g, " ")])).toEqual([
      ["Beto Medellín", "Pendiente", ""],
      ["Diego Medellín", "Seguimiento", "25/10/2026 4:30 p. m. · Monitora Medellín: Lo envía el viernes."],
    ]);
  });
  it("sin ciudad: todas las del usuario, archivo sin ciudad; sin sesión → 401", async () => {
    await como("admin");
    const r = await exportar();
    expect(r.headers.get("Content-Disposition")).toMatch(/filename="pendientes_testimonios_\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect(r.headers.get("X-Filas")).toBe("3"); // Ana Cali es realizado: no sale
    await como(null);
    expect((await exportar()).status).toBe(401);
  });
});

// ---------- Resumen de testimonios ----------
const resumen = async () => { const { GET } = await import("@/app/api/testimonios/resumen/route"); const r = await GET(); return { status: r.status, data: await r.json() }; };

describe("resumen de testimonios", () => {
  beforeEach(() => {
    mem.respuestas.push(
      { _id: new ObjectId(), participanteId: null, cruce: "sin_duenio" },
      { _id: new ObjectId(), participanteId: null, cruce: "sin_duenio" },
      { _id: new ObjectId(), participanteId: null, cruce: "conflicto" },
    );
  });
  it("el monitor recibe 403", async () => { await como("monitor", ["Cali"]); expect((await resumen()).status).toBe(403); });
  it("coordinación: avance por ciudad de menor a mayor, con monitores, sin datos de sin dueño", async () => {
    await como("coordinador");
    const r = await resumen();
    expect(r.status).toBe(200);
    expect(r.data.total).toEqual({ total: 2, realizado: 1, seguimiento: 0, pendiente: 1 });
    expect(r.data.ciudades).toEqual([
      { ciudad: "Medellín", total: 1, realizado: 0, seguimiento: 0, pendiente: 1, monitores: [] },
      { ciudad: "Cali", total: 1, realizado: 1, seguimiento: 0, pendiente: 0, monitores: ["Monitora Cali"] },
    ]);
    expect(r.data.porResolver).toBeNull();
  });
  it("admin además ve cuántas respuestas hay sin dueño y en conflicto", async () => {
    await como("admin");
    expect((await resumen()).data.porResolver).toEqual({ sinDuenio: 2, conflicto: 1 });
  });
});
