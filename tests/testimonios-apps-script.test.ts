import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizarRespuesta } from "@/lib/testimonios/cruce";

// Ejecuta docs/testimonios/apps-script.gs con una hoja simulada (archivo con varias pestañas y otros formularios)
// y pasa lo que envía por el webhook real de la app. Así se prueba el script tal como se pega en Apps Script.

const registradas = vi.hoisted(() => ({ items: [] as { respuesta: Record<string, unknown>; fila: number | null }[] }));
vi.mock("@/lib/testimonios/registro", () => ({
  registrarRespuestas: async (items: { respuesta: Record<string, unknown>; fila: number | null }[]) => {
    registradas.items.push(...items);
    return items.map(() => ({ estado: "nueva", id: "x", cruce: "auto" }));
  },
}));

const CODIGO = readFileSync(path.resolve(__dirname, "../docs/testimonios/apps-script.gs"), "utf8");
const SECRETO = "secreto-de-pruebas-del-webhook-0123456789";
const VIDEO = "¡Sube aquí tu testimonio!\nGraba un video de máximo 2 minutos contando qué aprendiste en el programa. "
  + "Súbelo a Drive y pega aquí el enlace con permiso de lectura. Si tienes dudas, escribe al WhatsApp o al celular de tu monitor, "
  + "o al correo del programa, indicando tu nombre completo, tu número de documento y tu ciudad. ¡Gracias por compartir tu experiencia con todos!";

const ENC = ["Marca temporal", "Nombre Completo", "Número de documento", "Correo", "Ciudad a la que perteneces", VIDEO, "Número de WhatsApp o Celular", "Observaciones internas"];
type Hoja = { nombre: string; filas: string[][] };
function libro(): Hoja[] {
  return [
    { nombre: "Estudiantes", filas: [["Documento", "Nombre", "Celular"], ["1001", "Valentina Gómez", "3001112233"]] },
    { nombre: "Inscripción-2026", filas: [["Marca temporal", "Nombre Completo", "Número de documento"], ["01/09/2026 8:00:00", "Otra Persona", "5555"]] },
    {
      nombre: "Testimonio-2026",
      filas: [
        ENC,
        ["20/10/2026 9:10:00", "Valentina Gómez", "1.001", "valentina.gomez@gmail.com", "Bogotá D.C.", "https://drive.google.com/file/d/a", "", "nota privada"], // antigua, sin celular
        ["", "", "", "", "", "", "", ""], // fila vacía
        ["25/10/2026 18:20:00", "Sofía Pérez", "", "sofia.perez@gmail.com", "Panamá", "https://drive.google.com/file/d/b, https://drive.google.com/file/d/c", "+507 6123-4567", "otra nota"],
      ],
    },
  ];
}

type Envio = { url: string; cuerpo: string };
function entorno(props: Record<string, string>, hojas = libro()) {
  const envios: Envio[] = [], logs: string[] = [];
  const store = { ...props };
  const sheet = (h: Hoja) => ({
    getName: () => h.nombre,
    getLastRow: () => h.filas.length,
    getLastColumn: () => Math.max(...h.filas.map((f) => f.length)),
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({ getDisplayValues: () => h.filas.slice(r - 1, r - 1 + nr).map((f) => Array.from({ length: nc }, (_, i) => f[c - 1 + i] ?? "")) }),
    getFormUrl: () => "https://docs.google.com/forms/x",
  });
  const sandbox = {
    console: { log: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => { store[k] = v; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n: string) => { const h = hojas.find((x) => x.nombre === n); return h ? sheet(h) : null; }, getSheets: () => hojas.map(sheet), getActiveSheet: () => sheet(hojas[0]) }) },
    UrlFetchApp: { fetch: (url: string, o: { payload: string }) => { envios.push({ url, cuerpo: o.payload }); return { getResponseCode: () => (o.payload === "{}" ? 400 : 200), getContentText: () => JSON.stringify({ invalidas: 0, resultados: [] }) }; } },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { sleep: () => undefined },
  };
  vm.createContext(sandbox);
  vm.runInContext(CODIGO, sandbox);
  const fn = (nombre: string, ...args: unknown[]) => (sandbox as unknown as Record<string, (...a: unknown[]) => void>)[nombre](...args);
  return { envios, logs, store, fn, sheet: (n: string) => sheet(hojas.find((x) => x.nombre === n)!) };
}
const PROPS = { TESTIMONIOS_URL: "https://validacion.tocaunavida.org/api/testimonios/webhook", TESTIMONIOS_SECRETO: SECRETO, HOJA_RESPUESTAS: "Testimonio-2026" };
const COLS7 = ["Marca temporal", "Nombre Completo", "Número de documento", "Correo", "Ciudad a la que perteneces", "¡Sube aquí tu testimonio!", "Número de WhatsApp o Celular"];

async function alWebhook(cuerpo: string) {
  process.env.TESTIMONIOS_WEBHOOK_SECRET = SECRETO;
  const { POST } = await import("@/app/api/testimonios/webhook/route");
  return POST(new Request("http://localhost/api/testimonios/webhook", { method: "POST", headers: { "Content-Type": "application/json", "X-Testimonios-Secret": SECRETO }, body: cuerpo }));
}

beforeEach(() => { registradas.items.length = 0; });

describe("Apps Script: elige la pestaña por nombre exacto", () => {
  it("sin HOJA_RESPUESTAS se detiene con un mensaje claro", () => {
    const { fn } = entorno({ TESTIMONIOS_URL: PROPS.TESTIMONIOS_URL, TESTIMONIOS_SECRETO: SECRETO });
    expect(() => fn("cargaInicial")).toThrow(/HOJA_RESPUESTAS/);
  });
  it("si la pestaña no existe se detiene (nunca usa la activa ni la primera)", () => {
    const { fn, envios } = entorno({ ...PROPS, HOJA_RESPUESTAS: "testimonio-2026" }); // distinto en mayúsculas
    expect(() => fn("cargaInicial")).toThrow(/No existe la pestaña "testimonio-2026"/);
    expect(envios).toHaveLength(0);
  });
  it("si falta una de las 7 columnas se detiene", () => {
    const hojas = libro();
    hojas[2].filas = hojas[2].filas.map((f) => f.filter((_, i) => i !== 3)); // sin Correo
    const { fn } = entorno(PROPS, hojas);
    expect(() => fn("cargaInicial")).toThrow(/No encuentro la columna "Correo"/);
  });
  it("probarConexion revisa pestaña y columnas y no envía respuestas", () => {
    const { fn, envios, logs } = entorno(PROPS);
    fn("probarConexion");
    expect(envios.map((e) => e.cuerpo)).toEqual(["{}"]);
    expect(logs.join("\n")).toMatch(/Pestaña "Testimonio-2026" encontrada: 3 filas/);
    expect(logs.join("\n")).toMatch(/¡Sube aquí tu testimonio! \(col\. 6\).*Número de WhatsApp o Celular \(col\. 7\)/);
    expect(logs.join("\n")).toMatch(/Conexión correcta/);
  });
});

describe("Apps Script: carga inicial", () => {
  it("envía solo las 7 columnas con nombres fijos, salta filas vacías y la app las acepta", async () => {
    const { fn, envios, logs } = entorno(PROPS);
    fn("cargaInicial");
    expect(envios).toHaveLength(1);
    const cuerpo = JSON.parse(envios[0].cuerpo) as { respuestas: { fila: number; respuesta: Record<string, string> }[] };
    expect(cuerpo.respuestas.map((r) => r.fila)).toEqual([2, 4]);
    for (const r of cuerpo.respuestas) expect(Object.keys(r.respuesta)).toEqual(COLS7);
    expect(envios[0].cuerpo).not.toContain("nota privada");
    expect(envios[0].cuerpo).not.toContain("Graba un video");
    expect(envios[0].cuerpo).not.toContain("Valentina Gómez\",\"3001112233"); // nada de la pestaña Estudiantes
    expect(logs.join("\n")).toMatch(/Carga inicial \(Testimonio-2026\): 2 respuestas enviadas, 0 quedaron pendientes/);

    const r = await alWebhook(envios[0].cuerpo);
    expect(r.status).toBe(200);
    const [vieja, nueva] = registradas.items.map((i) => normalizarRespuesta(i.respuesta));
    expect(vieja).toMatchObject({ documento: "1001", correo: "valentina.gomez@gmail.com", celular: null, enlaces: ["https://drive.google.com/file/d/a"] });
    expect(nueva).toMatchObject({ documento: null, celular: "61234567", ciudad: "Panamá", enlaces: ["https://drive.google.com/file/d/b", "https://drive.google.com/file/d/c"] });
  });
  it("con los encabezados crudos (como antes) la app rechazaría el lote: por eso el script los cambia", async () => {
    const crudo = JSON.stringify({ respuestas: [{ fila: 2, respuesta: Object.fromEntries(ENC.map((e, i) => [e, libro()[2].filas[1][i]])) }] });
    expect((await alWebhook(crudo)).status).toBe(400);
  });
});

describe("Apps Script: activador Al enviar el formulario", () => {
  it("ignora los envíos de otra pestaña (otro formulario del mismo archivo)", () => {
    const { fn, envios, logs, sheet } = entorno(PROPS);
    fn("alEnviarFormulario", { range: { getSheet: () => sheet("Inscripción-2026"), getRow: () => 2 } });
    expect(envios).toHaveLength(0);
    expect(logs.join("\n")).toMatch(/se ignora/);
  });
  it("envía la fila nueva de Testimonio-2026 con solo las 7 columnas", async () => {
    const { fn, envios, sheet } = entorno(PROPS);
    fn("alEnviarFormulario", { range: { getSheet: () => sheet("Testimonio-2026"), getRow: () => 4 } });
    expect(envios).toHaveLength(1);
    const item = JSON.parse(envios[0].cuerpo);
    expect(item.fila).toBe(4);
    expect(Object.keys(item.respuesta)).toEqual(COLS7);
    expect((await alWebhook(envios[0].cuerpo)).status).toBe(200);
  });
  it("ejecutado a mano (sin evento) no envía nada", () => {
    const { fn, envios } = entorno(PROPS);
    fn("alEnviarFormulario");
    expect(envios).toHaveLength(0);
  });
});
