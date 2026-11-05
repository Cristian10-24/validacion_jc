import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { normalizarRespuestaEncuesta } from "@/lib/encuesta/cruce";

// Ejecuta el script de testimonios y el de la encuesta EN EL MISMO contexto, como quedan en un mismo proyecto
// de Apps Script (todos los archivos comparten las globales), con un libro que tiene las dos pestañas.

const TESTIMONIOS = readFileSync(path.resolve(__dirname, "../docs/testimonios/apps-script.gs"), "utf8");
const ENCUESTA = readFileSync(path.resolve(__dirname, "../docs/encuesta/apps-script.gs"), "utf8");

type Hoja = { nombre: string; filas: string[][] };
const ENC_ENCUESTA = ["Marca temporal", "Correo electrónico", "Nombre completo", "Número de documento de identidad", "A qué ciudad pertenece tu grupo?", "¿Qué fue lo que más te gustó?", "Comentarios"];
const COLS5 = ENC_ENCUESTA.slice(0, 5);
function libro(): Hoja[] {
  return [
    {
      nombre: "Testimonio-2026",
      filas: [
        ["Marca temporal", "Nombre Completo", "Número de documento", "Correo", "Ciudad a la que perteneces", "¡Sube aquí tu testimonio!", "Número de WhatsApp o Celular"],
        ["20/10/2026 9:10:00", "Valentina Gómez", "1001", "valentina@gmail.com", "Bogotá", "https://drive.google.com/file/d/a", "3001112233"],
      ],
    },
    {
      nombre: "Encuesta-Final-2026",
      filas: [
        ENC_ENCUESTA,
        ["03/11/2026 14:05:10", "ana@gmail.com", "Ana Ruiz", "0.012.345", "Cali", "Todo", "respuesta privada"],
        ["", "", "", "", "", "", ""],
        ["04/11/2026 9:00:00", "luis@gmail.com", "Luis Pérez", "777", "Medellín", "Las clases", "otra privada"],
      ],
    },
  ];
}

const PROPS = {
  TESTIMONIOS_URL: "https://app/api/testimonios/webhook", TESTIMONIOS_SECRETO: "secreto-testimonios", HOJA_RESPUESTAS: "Testimonio-2026",
  ENCUESTA_URL: "https://app/api/encuesta/webhook", ENCUESTA_SECRETO: "secreto-encuesta", HOJA_ENCUESTA: "Encuesta-Final-2026",
};

type Envio = { url: string; cuerpo: string; headers: Record<string, string> };
function entorno(props: Record<string, string> = PROPS, orden: "testimonios_primero" | "encuesta_primero" = "testimonios_primero", hojas = libro()) {
  const envios: Envio[] = [], logs: string[] = [];
  const store = { ...props };
  const sheet = (h: Hoja) => ({
    getName: () => h.nombre,
    getLastRow: () => h.filas.length,
    getLastColumn: () => Math.max(...h.filas.map((f) => f.length)),
    getRange: (r: number, c: number, nr = 1, nc = 1) => ({ getDisplayValues: () => h.filas.slice(r - 1, r - 1 + nr).map((f) => Array.from({ length: nc }, (_, i) => f[c - 1 + i] ?? "")) }),
  });
  const sandbox: Record<string, unknown> = {
    console: { log: (m: string) => logs.push(m), warn: (m: string) => logs.push(m), error: (m: string) => logs.push(m) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k: string) => store[k] ?? null, setProperty: (k: string, v: string) => { store[k] = v; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n: string) => { const h = hojas.find((x) => x.nombre === n); return h ? sheet(h) : null; } }) },
    UrlFetchApp: {
      fetch: (url: string, o: { payload: string; headers: Record<string, string> }) => {
        envios.push({ url, cuerpo: o.payload, headers: o.headers });
        return { getResponseCode: () => (o.payload === "{}" ? 400 : 200), getContentText: () => JSON.stringify({ invalidas: 0, resultados: [] }) };
      },
    },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    Utilities: { sleep: () => undefined },
  };
  vm.createContext(sandbox);
  for (const codigo of orden === "testimonios_primero" ? [TESTIMONIOS, ENCUESTA] : [ENCUESTA, TESTIMONIOS]) vm.runInContext(codigo, sandbox);
  const fn = (nombre: string, ...args: unknown[]) => (sandbox[nombre] as (...a: unknown[]) => void)(...args);
  const evento = (hoja: string, fila: number) => ({ range: { getSheet: () => sheet(hojas.find((x) => x.nombre === hoja)!), getRow: () => fila } });
  return { envios, logs, store, fn, evento, sandbox };
}

describe("los dos scripts conviven en el mismo proyecto", () => {
  it("la encuesta solo agrega globales con prefijo encuesta/ENCUESTA_ (no pisa nada de testimonios)", () => {
    const soloTest: Record<string, unknown> = {};
    vm.createContext(soloTest);
    vm.runInContext(TESTIMONIOS, soloTest);
    const soloEnc: Record<string, unknown> = {};
    vm.createContext(soloEnc);
    vm.runInContext(ENCUESTA, soloEnc);
    const globalesEncuesta = Object.keys(soloEnc);
    expect(globalesEncuesta.sort()).toEqual(["ENCUESTA_", "encuestaAlEnviarFormulario", "encuestaCargaInicial", "encuestaProbarConexion", "encuestaReintentarPendientes"]);
    expect(globalesEncuesta.filter((k) => k in soloTest)).toEqual([]);
  });

  for (const orden of ["testimonios_primero", "encuesta_primero"] as const) {
    it(`(${orden}) un envío de la encuesta no llega a testimonios, y uno de testimonios no llega a la encuesta`, () => {
      const { fn, evento, envios } = entorno(PROPS, orden);
      // Al enviar el formulario se disparan LOS DOS activadores con el mismo evento.
      fn("alEnviarFormulario", evento("Encuesta-Final-2026", 2));
      fn("encuestaAlEnviarFormulario", evento("Encuesta-Final-2026", 2));
      expect(envios.map((e) => e.url)).toEqual([PROPS.ENCUESTA_URL]);

      envios.length = 0;
      fn("alEnviarFormulario", evento("Testimonio-2026", 2));
      fn("encuestaAlEnviarFormulario", evento("Testimonio-2026", 2));
      expect(envios.map((e) => e.url)).toEqual([PROPS.TESTIMONIOS_URL]);
      expect(envios[0].headers).toEqual({ "X-Testimonios-Secret": PROPS.TESTIMONIOS_SECRETO });
    });
  }
});

describe("script de la encuesta", () => {
  it("el activador envía solo las 5 columnas, a su URL y con su secreto", () => {
    const { fn, evento, envios } = entorno();
    fn("encuestaAlEnviarFormulario", evento("Encuesta-Final-2026", 4));
    expect(envios).toHaveLength(1);
    expect(envios[0].headers).toEqual({ "X-Encuesta-Secret": PROPS.ENCUESTA_SECRETO });
    const cuerpo = JSON.parse(envios[0].cuerpo);
    expect(cuerpo.fila).toBe(4);
    expect(Object.keys(cuerpo.respuesta)).toEqual(COLS5);
    expect(envios[0].cuerpo).not.toContain("privada");
    expect(normalizarRespuestaEncuesta(cuerpo.respuesta)).toMatchObject({ documento: "777", correo: "luis@gmail.com", nombre: "Luis Pérez" });
  });

  it("la carga inicial envía todas las filas existentes (salta vacías) en un lote", () => {
    const { fn, envios, logs } = entorno();
    fn("encuestaCargaInicial");
    expect(envios).toHaveLength(1);
    const { respuestas } = JSON.parse(envios[0].cuerpo) as { respuestas: { fila: number; respuesta: Record<string, string> }[] };
    expect(respuestas.map((r) => r.fila)).toEqual([2, 4]);
    expect(normalizarRespuestaEncuesta(respuestas[0].respuesta).documento).toBe("0012345");
    expect(logs.join("\n")).toMatch(/Carga inicial \(Encuesta-Final-2026\): 2 respuestas enviadas, 0 quedaron pendientes/);
  });

  it("sin sus propiedades se detiene; las de testimonios no le sirven", () => {
    const { fn, envios } = entorno({ TESTIMONIOS_URL: PROPS.TESTIMONIOS_URL, TESTIMONIOS_SECRETO: "x", HOJA_RESPUESTAS: "Testimonio-2026" });
    expect(() => fn("encuestaCargaInicial")).toThrow(/ENCUESTA_URL, ENCUESTA_SECRETO y HOJA_ENCUESTA/);
    expect(envios).toHaveLength(0);
  });

  it("si la pestaña no existe con ese nombre exacto se detiene", () => {
    const { fn } = entorno({ ...PROPS, HOJA_ENCUESTA: "encuesta-final-2026" });
    expect(() => fn("encuestaCargaInicial")).toThrow(/No existe la pestaña "encuesta-final-2026"/);
  });

  it("probarConexion revisa pestaña y columnas sin enviar respuestas", () => {
    const { fn, envios, logs } = entorno();
    fn("encuestaProbarConexion");
    expect(envios.map((e) => e.cuerpo)).toEqual(["{}"]);
    expect(logs.join("\n")).toMatch(/Pestaña "Encuesta-Final-2026" encontrada: 3 filas/);
    expect(logs.join("\n")).toMatch(/Conexión correcta/);
  });

  it("si un envío falla, la fila queda en su propia cola y encuestaReintentarPendientes la reenvía", () => {
    const { fn, evento, store, sandbox, envios } = entorno();
    const fetch = (sandbox.UrlFetchApp as { fetch: unknown }).fetch;
    (sandbox.UrlFetchApp as { fetch: unknown }).fetch = () => ({ getResponseCode: () => 500, getContentText: () => "" });
    fn("encuestaAlEnviarFormulario", evento("Encuesta-Final-2026", 2));
    expect(JSON.parse(store.ENCUESTA_PENDIENTES)).toEqual([2]);
    expect("TESTIMONIOS_PENDIENTES" in store).toBe(false);
    (sandbox.UrlFetchApp as { fetch: unknown }).fetch = fetch;
    fn("encuestaReintentarPendientes");
    expect(envios).toHaveLength(1);
    expect(JSON.parse(store.ENCUESTA_PENDIENTES)).toEqual([]);
  });
});
