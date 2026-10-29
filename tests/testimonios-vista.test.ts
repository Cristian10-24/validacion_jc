import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compararTestimonios } from "@/lib/testimonios/estado";

// Alcance por ciudad validado en el servidor, con una base EN MEMORIA (sin Mongo).
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("@/lib/db", () => ({ collections: async () => ({ users: { findOne: async () => estado.usuario } }), getDb: () => { throw new Error("no"); } }));

const mem = vi.hoisted(() => ({ participantes: [] as Record<string, unknown>[], respuestas: [] as Record<string, unknown>[], comentarios: [] as Record<string, unknown>[] }));
vi.mock("@/lib/testimonios/db", () => {
  const valor = (d: Record<string, unknown>, k: string) => k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], d);
  const cumple = (d: Record<string, unknown>, q: Record<string, unknown>) => Object.entries(q).every(([k, v]) => {
    const x = valor(d, k);
    if (v && typeof v === "object" && "$in" in (v as object)) return ((v as { $in: unknown[] }).$in).some((y) => String(y) === String(x));
    return String(x) === String(v);
  });
  const col = (arr: Record<string, unknown>[]) => ({
    find: (q: Record<string, unknown> = {}) => { const r = arr.filter((d) => cumple(d, q)); const cur = { toArray: async () => r, sort: () => cur }; return cur; },
    findOne: async (q: Record<string, unknown>) => arr.find((d) => cumple(d, q)) ?? null,
    insertOne: async (d: Record<string, unknown>) => { arr.push(d); },
    countDocuments: async (q: Record<string, unknown> = {}) => arr.filter((d) => cumple(d, q)).length,
    updateOne: async (q: Record<string, unknown>, u: { $set: Record<string, unknown> }) => {
      const d = arr.find((x) => cumple(x, q));
      if (d) Object.assign(d, u.$set);
      return { matchedCount: d ? 1 : 0, modifiedCount: d ? 1 : 0 };
    },
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

describe("estado: Realizado = al menos un envío asignado (automático o manual)", () => {
  const otra = new ObjectId();
  beforeEach(() => {
    mem.participantes.push({ _id: otra, documento: "9", nombre: "Ceci Cali", ciudad: "Cali", celular: "", correo: "" });
  });
  const de = async (id: ObjectId) => (await listar()).data.filas.find((f: { id: string }) => f.id === id.toHexString());
  it("las respuestas descartadas, sin dueño o en conflicto no cuentan, aunque apunten al participante", async () => {
    for (const cruce of ["descartada", "sin_duenio", "conflicto"]) {
      mem.respuestas.push({ _id: new ObjectId(), participanteId: otra, cruce, marcaTemporal: "21/10/2026 9:00:00", recibidaEn: new Date(), enlaces: ["https://drive.google.com/y"] });
    }
    await como("admin");
    expect(await de(otra)).toMatchObject({ estado: "pendiente", envios: [] });
  });
  it("un envío asignado a mano sí cuenta", async () => {
    mem.respuestas.push({ _id: new ObjectId(), participanteId: otra, cruce: "manual", cruzadoPor: "manual", marcaTemporal: "21/10/2026 9:00:00", recibidaEn: new Date(), enlaces: ["https://drive.google.com/z"] });
    await como("admin");
    expect(await de(otra)).toMatchObject({ estado: "realizado", envios: [{ cruzadoPor: "manual" }] });
  });
  it("un realizado con comentarios sigue Realizado y conserva sus comentarios", async () => {
    mem.comentarios.push({ _id: new ObjectId(), participanteId: CALI, texto: "Ya lo vimos.", autor: { usuario: "x", nombre: "X", rol: "admin" }, fecha: new Date() });
    await como("admin");
    expect(await de(CALI)).toMatchObject({ estado: "realizado", conComentarios: true, comentarios: [{ texto: "Ya lo vimos." }] });
  });
});

describe("comentarios", () => {
  it("el monitor comenta en su ciudad y queda con autor y fecha; sigue Pendiente, con la etiqueta de comentarios", async () => {
    await como("monitor", ["Medellín"]);
    const r = await comentar(MEDE.toHexString(), "  Lo llamé,   dijo que lo envía el viernes. ");
    expect(r.status).toBe(201);
    expect(r.data.comentario).toMatchObject({ texto: "Lo llamé, dijo que lo envía el viernes.", autor: { usuario: "u-monitor", rol: "monitor" }, editadoEn: null });
    expect((await listar()).data.filas[0]).toMatchObject({ nombre: "Beto Medellín", estado: "pendiente", conComentarios: true });
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
      ["Nombre completo", "Celular", "Correo", "Documento", "Ciudad", "Con comentarios", "Último comentario"],
      ["Carla Cali", "+57 310 555 0033", "carla@gmail.com", "3", "Cali", "No", ""],
    ]);
  });
  it("con ciudad filtrada exporta solo esa ciudad, con su nombre de archivo", async () => {
    await como("coordinador");
    const r = await exportar("Medellín");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toMatch(/filename="pendientes_testimonios_Medellin_\d{4}-\d{2}-\d{2}\.xlsx"/);
    expect((await leerExcel(r)).slice(1).map((f) => f[0])).toEqual(["Beto Medellín", "Diego Medellín"]);
  });
  it("incluye a los pendientes con comentarios: Con comentarios (Sí/No) y el último comentario con fecha; primero los sin comentarios", async () => {
    const diego = mem.participantes.find((p) => p.nombre === "Diego Medellín")!._id;
    const autor = { usuario: "m", nombre: "Monitora Medellín", rol: "monitor" };
    mem.comentarios.push(
      { _id: new ObjectId(), participanteId: diego, texto: "No contesta.", autor, fecha: new Date("2026-10-24T14:00:00Z") },
      { _id: new ObjectId(), participanteId: diego, texto: "Lo envía\nel viernes.", autor, fecha: new Date("2026-10-25T21:30:00Z") },
    );
    await como("monitor", ["Medellín"]);
    const filas = (await leerExcel(await exportar("Medellín"))).slice(1);
    expect(filas.map((f) => [f[0], f[5], String(f[6] ?? "").replace(/\s/g, " ")])).toEqual([
      ["Beto Medellín", "No", ""],
      ["Diego Medellín", "Sí", "25/10/2026 4:30 p. m. · Monitora Medellín: Lo envía el viernes."],
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
    expect(r.data.total).toEqual({ total: 2, realizado: 1, pendiente: 1, conComentarios: 0 });
    expect(r.data.ciudades).toEqual([
      { ciudad: "Medellín", total: 1, realizado: 0, pendiente: 1, conComentarios: 0, monitores: [] },
      { ciudad: "Cali", total: 1, realizado: 1, pendiente: 0, conComentarios: 0, monitores: ["Monitora Cali"] },
    ]);
    expect(r.data.porResolver).toBeNull();
  });
  it("admin además ve cuántas respuestas hay sin dueño y en conflicto", async () => {
    await como("admin");
    expect((await resumen()).data.porResolver).toEqual({ sinDuenio: 2, conflicto: 1 });
  });
});

describe("resumen: Todos = Realizados + Pendientes y Con comentarios incluidos en Pendientes", () => {
  it("los pendientes con comentarios se cuentan en Pendientes; los comentarios de un realizado no suman", async () => {
    const autor = { usuario: "x", nombre: "X", rol: "monitor" };
    const p2 = new ObjectId(), p3 = new ObjectId();
    mem.participantes.push(
      { _id: p2, documento: "5", nombre: "Eva Medellín", ciudad: "Medellín", celular: "", correo: "" },
      { _id: p3, documento: "6", nombre: "Fede Medellín", ciudad: "Medellín", celular: "", correo: "" },
    );
    mem.comentarios.push(
      { _id: new ObjectId(), participanteId: MEDE, texto: "a", autor, fecha: new Date() },
      { _id: new ObjectId(), participanteId: p2, texto: "b", autor, fecha: new Date() },
      { _id: new ObjectId(), participanteId: CALI, texto: "c", autor, fecha: new Date() }, // realizado
    );
    await como("coordinador");
    const { data } = await resumen();
    expect(data.total).toEqual({ total: 4, realizado: 1, pendiente: 3, conComentarios: 2 });
    for (const c of [data.total, ...data.ciudades]) {
      expect(c.realizado + c.pendiente).toBe(c.total);
      expect(c.conComentarios).toBeLessThanOrEqual(c.pendiente);
    }
    expect(data.ciudades.find((c: { ciudad: string }) => c.ciudad === "Medellín")).toMatchObject({ total: 3, pendiente: 3, conComentarios: 2 });
  });
});

// ---------- Editar comentarios ----------
const editar = async (id: string, comentarioId: string, texto: unknown) => {
  const { PATCH } = await import("@/app/api/testimonios/[id]/comentarios/[comentarioId]/route");
  const r = await PATCH(new Request("http://localhost/x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) }), { params: Promise.resolve({ id, comentarioId }) });
  return { status: r.status, data: await r.json() };
};

describe("editar comentarios", () => {
  const PROPIO = new ObjectId(), AJENO = new ObjectId(), OTRO_PART = new ObjectId();
  const fechaOriginal = new Date("2026-10-24T14:00:00Z");
  beforeEach(() => {
    mem.comentarios.push(
      { _id: PROPIO, participanteId: MEDE, texto: "Lo llamé.", autor: { usuario: "u-monitor", nombre: "Usuario monitor", rol: "monitor" }, fecha: fechaOriginal },
      { _id: AJENO, participanteId: MEDE, texto: "Comentario de la coordinación.", autor: { usuario: "u-coordinador", nombre: "Coord", rol: "coordinador" }, fecha: fechaOriginal },
      { _id: OTRO_PART, participanteId: CALI, texto: "En Cali.", autor: { usuario: "u-monitor", nombre: "Usuario monitor", rol: "monitor" }, fecha: fechaOriginal },
    );
  });
  const otros = () => JSON.stringify(mem.comentarios.filter((c) => !(c._id as ObjectId).equals(PROPIO)));

  it("el autor edita su comentario: solo cambia ese (texto, editadoEn, editadoPor); fecha y autor quedan igual", async () => {
    const antes = otros();
    await como("monitor", ["Medellín"]);
    const r = await editar(MEDE.toHexString(), PROPIO.toHexString(), "  Lo llamé   dos veces. ");
    expect(r.status).toBe(200);
    expect(r.data.comentario).toMatchObject({ id: PROPIO.toHexString(), texto: "Lo llamé dos veces.", fecha: fechaOriginal.toISOString() });
    expect(r.data.comentario.editadoEn).toBeTruthy();
    const guardado = mem.comentarios.find((c) => (c._id as ObjectId).equals(PROPIO))!;
    expect(guardado).toMatchObject({ texto: "Lo llamé dos veces.", fecha: fechaOriginal, autor: { usuario: "u-monitor" }, editadoPor: { usuario: "u-monitor", nombre: "Usuario monitor" } });
    expect(guardado.editadoEn).toBeInstanceOf(Date);
    expect(Object.keys(guardado).sort()).toEqual(["_id", "autor", "editadoEn", "editadoPor", "fecha", "participanteId", "texto"]); // sin texto anterior
    expect(otros()).toBe(antes); // ningún otro comentario cambió
    const vista = (await listar()).data.filas[0].comentarios.find((c: { id: string }) => c.id === PROPIO.toHexString());
    expect(vista.editadoEn).toBe((guardado.editadoEn as Date).toISOString());
  });
  it("editar el comentario de otro usuario → 403 y no cambia nada (también para admin)", async () => {
    const antes = JSON.stringify(mem.comentarios);
    await como("monitor", ["Medellín"]);
    expect((await editar(MEDE.toHexString(), AJENO.toHexString(), "cambiado")).status).toBe(403);
    await como("admin");
    expect((await editar(MEDE.toHexString(), AJENO.toHexString(), "cambiado")).status).toBe(403);
    expect(JSON.stringify(mem.comentarios)).toBe(antes);
  });
  it("monitor de otra ciudad → 404 (aunque el comentario sea suyo) y no cambia nada", async () => {
    const antes = JSON.stringify(mem.comentarios);
    await como("monitor", ["Medellín"]);
    expect((await editar(CALI.toHexString(), OTRO_PART.toHexString(), "cambiado")).status).toBe(404);
    expect(JSON.stringify(mem.comentarios)).toBe(antes);
  });
  it("comentario de otro participante o inexistente → 404; id inválido → 400", async () => {
    await como("monitor", ["Medellín"]);
    expect((await editar(MEDE.toHexString(), OTRO_PART.toHexString(), "x")).status).toBe(404);
    expect((await editar(MEDE.toHexString(), new ObjectId().toHexString(), "x")).status).toBe(404);
    expect((await editar("no-es-id", PROPIO.toHexString(), "x")).status).toBe(400);
  });
  it("mismas validaciones que al crear: vacío o más de 1000 caracteres → 400; sin sesión → 401", async () => {
    await como("monitor", ["Medellín"]);
    expect((await editar(MEDE.toHexString(), PROPIO.toHexString(), "   ")).status).toBe(400);
    expect((await editar(MEDE.toHexString(), PROPIO.toHexString(), "x".repeat(1001))).status).toBe(400);
    expect((await editar(MEDE.toHexString(), PROPIO.toHexString(), "x".repeat(1000))).status).toBe(200);
    await como(null);
    expect((await editar(MEDE.toHexString(), PROPIO.toHexString(), "hola")).status).toBe(401);
  });
});

describe("último comentario: cuenta la fecha de edición", () => {
  it("editar un comentario antiguo sube a ese participante al primer lugar entre los pendientes con comentarios", async () => {
    const EVA = new ObjectId(), VIEJO = new ObjectId();
    mem.participantes.push({ _id: EVA, documento: "5", nombre: "Eva Medellín", ciudad: "Medellín", celular: "", correo: "" });
    mem.comentarios.push(
      { _id: VIEJO, participanteId: MEDE, texto: "Primer contacto.", autor: { usuario: "u-monitor", nombre: "Usuario monitor", rol: "monitor" }, fecha: new Date("2026-10-20T15:00:00Z") },
      { _id: new ObjectId(), participanteId: EVA, texto: "La llamé ayer.", autor: { usuario: "otra", nombre: "Otra", rol: "monitor" }, fecha: new Date("2026-10-27T15:00:00Z") },
    );
    await como("monitor", ["Medellín"]);
    const ordenConComentarios = async () => ((await listar()).data.filas as Parameters<typeof compararTestimonios>[0][])
      .filter((x) => x.estado === "pendiente" && x.ultimoComentario !== null).sort(compararTestimonios).map((x) => x.nombre);
    expect(await ordenConComentarios()).toEqual(["Eva Medellín", "Beto Medellín"]);

    expect((await editar(MEDE.toHexString(), VIEJO.toHexString(), "Primer contacto; volví a llamar hoy.")).status).toBe(200);
    expect(await ordenConComentarios()).toEqual(["Beto Medellín", "Eva Medellín"]);
    const beto = (await listar()).data.filas.find((x: { nombre: string }) => x.nombre === "Beto Medellín");
    const editadoEn = (mem.comentarios.find((c) => (c._id as ObjectId).equals(VIEJO))!.editadoEn as Date).getTime();
    expect(beto).toMatchObject({ ultimoComentario: editadoEn, ultimoComentarioEditado: true });

    // En el Excel, la columna "Último comentario" usa la fecha de la edición y dice "(editado)"
    const filas = (await leerExcel(await exportar("Medellín"))).slice(1);
    const fila = filas.find((x) => x[0] === "Beto Medellín")!;
    expect(String(fila[6]).replace(/\s/g, " ")).toMatch(/^\d{2}\/\d{2}\/\d{4} .+ \(editado\) · Usuario monitor: Primer contacto; volví a llamar hoy\.$/);
    expect(String(filas.find((x) => x[0] === "Eva Medellín")![6])).not.toContain("(editado)");
  });
});
