import { beforeEach, describe, expect, it, vi } from "vitest";

// Base EN MEMORIA: nunca se conecta a Mongo. Se simula solo encuesta_respuestas.
const mem = vi.hoisted(() => ({ respuestas: [] as Record<string, unknown>[] }));
vi.mock("@/lib/encuesta/db", () => ({
  encuesta: async () => ({
    respuestas: {
      findOne: async (q: Record<string, unknown>) => mem.respuestas.find((d) => d.clave === q.clave) ?? null,
      insertOne: async (d: Record<string, unknown>) => {
        if (mem.respuestas.some((x) => x.clave === d.clave)) throw Object.assign(new Error("dup"), { code: 11000 });
        mem.respuestas.push(d);
      },
    },
  }),
}));

const SECRETO = "secreto-encuesta-de-pruebas-0123456789";
const fila = (extra: Record<string, string> = {}) => ({
  "Marca temporal": "03/11/2026 14:05:10",
  "Correo electrónico": "ana@gmail.com",
  "Nombre completo": "Ana Ruiz",
  "Número de documento de identidad": "001.234",
  "A qué ciudad pertenece tu grupo?": "Cali",
  ...extra,
});
async function post(body: unknown, secreto: string | null = SECRETO, cabecera = "X-Encuesta-Secret") {
  const { POST } = await import("@/app/api/encuesta/webhook/route");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secreto !== null) headers[cabecera] = secreto;
  const res = await POST(new Request("http://localhost/api/encuesta/webhook", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: res.status, data: await res.json() };
}

beforeEach(() => {
  mem.respuestas.length = 0;
  process.env.ENCUESTA_WEBHOOK_SECRET = SECRETO;
});

describe("webhook de la encuesta", () => {
  it("sin ENCUESTA_WEBHOOK_SECRET configurado rechaza todo (503)", async () => {
    delete process.env.ENCUESTA_WEBHOOK_SECRET;
    expect((await post({ fila: 2, respuesta: fila() })).status).toBe(503);
    expect(mem.respuestas).toHaveLength(0);
  });
  it("secreto incorrecto o ausente: 401", async () => {
    expect((await post({ fila: 2, respuesta: fila() }, "otro")).status).toBe(401);
    expect((await post({ fila: 2, respuesta: fila() }, null)).status).toBe(401);
  });
  it("el secreto de testimonios en su cabecera no sirve aquí", async () => {
    process.env.TESTIMONIOS_WEBHOOK_SECRET = "secreto-de-testimonios-0123456789";
    expect((await post({ fila: 2, respuesta: fila() }, "secreto-de-testimonios-0123456789", "X-Testimonios-Secret")).status).toBe(401);
  });
  it("guarda la respuesta con el documento normalizado y no la duplica al reenviarla", async () => {
    const r1 = await post({ fila: 2, respuesta: fila() });
    expect(r1).toMatchObject({ status: 200, data: { nuevas: 1, duplicadas: 0 } });
    expect(mem.respuestas[0]).toMatchObject({ fila: 2, norm: { documento: "001234", correo: "ana@gmail.com", nombre: "Ana Ruiz", ciudad: "Cali" } });
    const r2 = await post({ respuestas: [{ fila: 2, respuesta: fila() }, { fila: 3, respuesta: fila({ "Marca temporal": "04/11/2026 9:00:00" }) }] });
    expect(r2.data).toMatchObject({ nuevas: 1, duplicadas: 1 });
    expect(mem.respuestas).toHaveLength(2);
  });
  it("sin marca temporal, o sin documento ni correo, la respuesta es inválida", async () => {
    const r = await post({ respuestas: [
      { fila: 2, respuesta: fila({ "Marca temporal": "" }) },
      { fila: 3, respuesta: fila({ "Correo electrónico": "", "Número de documento de identidad": "" }) },
    ] });
    expect(r.data).toMatchObject({ nuevas: 0, invalidas: 2 });
    expect(mem.respuestas).toHaveLength(0);
  });
  it("cuerpo vacío o con campos extra: 400 (así responde a encuestaProbarConexion)", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ respuesta: fila(), otra: 1 })).status).toBe(400);
  });
});
