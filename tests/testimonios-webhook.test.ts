import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Base EN MEMORIA para el webhook: nunca se conecta a Mongo. Se simulan solo las colecciones testimonios_*.
const mem = vi.hoisted(() => ({ participantes: [] as Record<string, unknown>[], respuestas: [] as Record<string, unknown>[] }));
vi.mock("@/lib/testimonios/db", () => {
  const coincide = (doc: Record<string, unknown>, q: Record<string, unknown>) => Object.entries(q).every(([k, v]) => doc[k] === v);
  return {
    testimonios: async () => ({
      participantes: { find: () => ({ toArray: async () => mem.participantes }) },
      respuestas: {
        findOne: async (q: Record<string, unknown>) => mem.respuestas.find((d) => coincide(d, q)) ?? null,
        insertOne: async (d: Record<string, unknown>) => {
          if (mem.respuestas.some((x) => x.clave === d.clave)) throw Object.assign(new Error("dup"), { code: 11000 });
          mem.respuestas.push(d);
        },
      },
    }),
  };
});

const SECRETO = "secreto-de-pruebas-del-webhook-0123456789";
const fila = (extra: Record<string, string> = {}) => ({
  "Marca temporal": "20/10/2026 10:30:00",
  "Nombre Completo": "Ana Ruiz",
  "Número de documento": "1.001",
  "Correo": "ana@gmail.com",
  "Número de WhatsApp o Celular": "+57 300 111 2233",
  "Ciudad a la que perteneces": "Cali",
  "¡Sube aquí tu testimonio!": "https://drive.google.com/open?id=video-ana",
  ...extra,
});
async function post(body: unknown, secreto: string | null = SECRETO) {
  const { POST } = await import("@/app/api/testimonios/webhook/route");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secreto !== null) headers["X-Testimonios-Secret"] = secreto;
  const res = await POST(new Request("http://localhost/api/testimonios/webhook", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
}

beforeEach(() => {
  process.env.TESTIMONIOS_WEBHOOK_SECRET = SECRETO;
  mem.respuestas.length = 0;
  mem.participantes.length = 0;
  mem.participantes.push(
    { _id: new ObjectId(), documento: "1001", correo: "ana@gmail.com", celularClave: "3001112233" },
    { _id: new ObjectId(), documento: "1002", correo: "familia@gmail.com", celularClave: null },
    { _id: new ObjectId(), documento: "1003", correo: "familia@gmail.com", celularClave: null },
  );
});

describe("webhook: secreto", () => {
  it("sin la variable configurada rechaza todo (503)", async () => {
    delete process.env.TESTIMONIOS_WEBHOOK_SECRET;
    expect((await post({ respuesta: fila() })).status).toBe(503);
    expect(mem.respuestas).toHaveLength(0);
  });
  it("sin cabecera de secreto → 401", async () => {
    expect((await post({ respuesta: fila() }, null)).status).toBe(401);
    expect(mem.respuestas).toHaveLength(0);
  });
  it("secreto incorrecto (o de otra longitud) → 401", async () => {
    for (const s of ["otro", SECRETO + "x", SECRETO.slice(0, -1), ""]) expect((await post({ respuesta: fila() }, s)).status, s).toBe(401);
    expect(mem.respuestas).toHaveLength(0);
  });
  it("cuerpo inválido → 400 (con secreto correcto)", async () => {
    expect((await post("no-es-json")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ respuesta: fila(), campoExtra: 1 })).status).toBe(400);
  });
});

describe("webhook: registro e idempotencia", () => {
  it("guarda la respuesta original completa, la fecha de recepción y cruza por documento", async () => {
    const r = await post({ fila: 2, respuesta: fila() });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ nuevas: 1, duplicadas: 0 });
    expect(mem.respuestas).toHaveLength(1);
    const g = mem.respuestas[0];
    expect(g.original).toEqual(fila());
    expect(g.recibidaEn).toBeInstanceOf(Date);
    expect(g).toMatchObject({ fila: 2, cruce: "auto", cruzadoPor: "documento", enlaces: ["https://drive.google.com/open?id=video-ana"] });
  });
  it("la misma respuesta dos veces no se duplica", async () => {
    await post({ fila: 2, respuesta: fila() });
    const r = await post({ fila: 2, respuesta: fila() });
    expect(r.data).toMatchObject({ nuevas: 0, duplicadas: 1 });
    expect(mem.respuestas).toHaveLength(1);
  });
  it("la misma respuesta en otra fila (se borró una fila del Sheet) tampoco se duplica", async () => {
    await post({ fila: 5, respuesta: fila() });
    expect((await post({ fila: 4, respuesta: fila() })).data).toMatchObject({ duplicadas: 1 });
    expect(mem.respuestas).toHaveLength(1);
  });
  it("carga inicial en lote: nuevas, duplicadas, inválidas, sin dueño y conflicto", async () => {
    await post({ respuesta: fila() });
    const r = await post({ respuestas: [
      { fila: 2, respuesta: fila() },                                                                            // ya estaba
      { fila: 3, respuesta: fila({ "Marca temporal": "21/10/2026 09:00:00", "Número de documento": "", "Correo": "nadie@gmail.com", "Número de WhatsApp o Celular": "" }) }, // sin dueño
      { fila: 4, respuesta: fila({ "Marca temporal": "22/10/2026 09:00:00", "Número de documento": "", "Correo": "familia@gmail.com", "Número de WhatsApp o Celular": "" }) }, // conflicto
      { fila: 5, respuesta: fila({ "Marca temporal": "23/10/2026 09:00:00", "Número de documento": "1002", "Correo": "familia@gmail.com" }) }, // hermano: gana el documento
      { fila: 6, respuesta: { "Nombre Completo": "Sin fecha" } },                                                // inválida
    ] });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ nuevas: 3, duplicadas: 1, invalidas: 1 });
    expect(r.data.resultados.map((x: { estado: string; cruce?: string }) => x.cruce ?? x.estado)).toEqual(["duplicada", "sin_duenio", "conflicto", "auto", "invalida"]);
    expect(mem.respuestas).toHaveLength(4);
  });
  it("varios enlaces en la celda se guardan todos", async () => {
    await post({ respuesta: fila({ "¡Sube aquí tu testimonio!": "https://drive.google.com/a, https://drive.google.com/b" }) });
    expect(mem.respuestas[0].enlaces).toEqual(["https://drive.google.com/a", "https://drive.google.com/b"]);
  });
});
