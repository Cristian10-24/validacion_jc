import { readFileSync } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import type { Evento } from "@/lib/clausura/db";
import { completarEjemplo, datosDesdeArchivo, EventoArchivo, eventoVista, presentacionDe } from "@/lib/clausura/evento";
import { sinComentarios } from "@/lib/clausura/jsonc";
import { diasParaCerrar, preguntasFrecuentes, sinMarcadores, textoQuedan } from "@/lib/clausura/presentacion";

// Portada pública rediseñada: textos derivados de los datos del evento (sin marcadores) y "Quedan N días".
const leer = (n: string) => JSON.parse(sinComentarios(readFileSync(path.resolve(__dirname, "..", "eventos", n), "utf8")));
const evento = (n: string, extra: Partial<Evento> = {}): Evento => ({
  _id: new ObjectId(), ...datosDesdeArchivo(EventoArchivo.parse(completarEjemplo(leer(n)))), formularioVersion: 1,
  creadoEn: new Date(), actualizadoEn: new Date(), actualizadoPor: "prueba", ...extra,
});
const TZ = "America/Bogota";
// Fecha límite real de Cartagena: lunes 9 de noviembre de 2026, 11:59 p. m. (hora de Colombia) = 04:59 UTC del martes.
const LIMITE = new Date("2026-11-10T04:59:00Z");
/** Todos los textos (valores string) de un objeto, para buscar marcadores sin confundirlos con arreglos JSON. */
const textos = (v: unknown): string[] =>
  typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(textos) : v && typeof v === "object" ? Object.values(v).flatMap(textos) : [];
const MARCADOR = /\[[^\]]*\]/;

describe('"Quedan N días" en la zona del evento', () => {
  it("cuenta días de calendario en hora de Colombia", () => {
    expect(textoQuedan(LIMITE, TZ, new Date("2026-11-06T15:00:00-05:00"))).toBe("Quedan 3 días");
    expect(textoQuedan(LIMITE, TZ, new Date("2026-11-08T08:00:00-05:00"))).toBe("Queda 1 día");
  });
  it('"Último día" si cierra hoy, aunque en UTC ya sea otro día', () => {
    expect(textoQuedan(LIMITE, TZ, new Date("2026-11-09T00:01:00-05:00"))).toBe("Último día");
    expect(textoQuedan(LIMITE, TZ, new Date("2026-11-09T21:00:00-05:00"))).toBe("Último día"); // 02:00 UTC del 10
    expect(diasParaCerrar(LIMITE, TZ, new Date("2026-11-09T23:58:00-05:00"))).toBe(0);
  });
  it("sin texto si ya cerró o no hay fecha límite", () => {
    expect(textoQuedan(LIMITE, TZ, new Date("2026-11-10T00:00:00-05:00"))).toBeNull();
    expect(textoQuedan(null, TZ)).toBeNull();
  });
  it("en la zona de Uruguay (UTC-3) el día cambia 2 horas antes", () => {
    const limite = new Date("2026-11-10T02:59:00Z"); // lunes 9, 11:59 p. m. en Montevideo
    expect(textoQuedan(limite, "America/Montevideo", new Date("2026-11-09T22:30:00-03:00"))).toBe("Último día");
  });
});

describe("ningún marcador [...] llega a la pantalla", () => {
  it("sinMarcadores oculta textos con [HORA], [POR DEFINIR] o [...]", () => {
    for (const t of ["[HORA]", "Confirma hasta el [FECHA LÍMITE]", "[POR DEFINIR]", "Sala [...]", "", null]) expect(sinMarcadores(t)).toBeNull();
    expect(sinMarcadores("Universidad Católica")).toBe("Universidad Católica");
  });
  it("con datos pendientes, la presentación del evento no contiene ningún marcador", () => {
    const e = evento("cartagena.json", { lugar: "[POR DEFINIR]", direccion: "[DIRECCIÓN]", nombreVisible: "Cartagena" });
    const p = presentacionDe(e, new Date("2026-11-06T12:00:00Z"));
    expect(textos(p).filter((x) => MARCADOR.test(x))).toEqual([]);
    expect(p.lugar).toBeNull();
    expect(p.direccion).toBeNull();
  });
  it("con los datos reales, la portada de Cali y Cartagena sale completa y sin marcadores", () => {
    for (const n of ["cali.json", "cartagena.json"]) {
      const v = eventoVista(evento(n), new Date("2026-11-06T12:00:00Z"));
      const { formulario: _f, ...resto } = v;
      expect(textos(resto).filter((x) => MARCADOR.test(x)), n).toEqual([]);
    }
    const ctg = presentacionDe(evento("cartagena.json"), new Date("2026-11-06T12:00:00-05:00"));
    expect(ctg).toMatchObject({
      etiquetaTipo: "CLAUSURA", etiquetaCiudad: "CLAUSURA · CARTAGENA", invitacion: "Clausura Jóvenes creaTIvos 2026 – Cartagena",
      horaRango: "3:00 p. m. – 5:00 p. m.", zonaTexto: "Hora de Colombia", diaCorto: "Jueves 19 nov", limiteDia: "Lunes 9 de noviembre", quedan: "Quedan 3 días",
    });
    expect(presentacionDe(evento("cali.json")).invitacion).toBe("EXPOFeria y clausura Jóvenes creaTIvos 2026 – Cali");
  });
  it("los componentes de la portada no traen marcadores escritos a mano", () => {
    for (const f of ["ClausuraPortada.tsx", "ClausuraFlujo.tsx"]) {
      const t = readFileSync(path.resolve(__dirname, "..", "src", "components", f), "utf8");
      expect(t, f).not.toMatch(/\[(HORA|FECHA[^\]]*|RESPUESTA[^\]]*|\.\.\.|…)\]/);
    }
  });
});

describe("preguntas frecuentes según la configuración", () => {
  const cali = evento("cali.json");
  it("acompañante solo si el formulario tiene esa sección", () => {
    expect(preguntasFrecuentes([cali]).map((p) => p.pregunta)).toContain("¿Puedo llevar un acompañante?");
    const sinAcomp = { ...cali, formulario: { secciones: cali.formulario.secciones.filter((s) => s.id !== "s_acompanante") } };
    expect(preguntasFrecuentes([sinAcomp]).map((p) => p.pregunta)).not.toContain("¿Puedo llevar un acompañante?");
  });
  it("cambiar la respuesta: el texto depende de permitirEdicion", () => {
    expect(preguntasFrecuentes([cali]).at(-1)).toEqual({ pregunta: "¿Puedo cambiar mi respuesta después de enviarla?", respuesta: "Después de enviarla no se puede cambiar. Si necesitas un cambio, escríbele a tu monitor." });
    expect(preguntasFrecuentes([{ ...cali, permitirEdicion: true }]).at(-1)!.respuesta).toMatch(/^Sí\./);
    expect(preguntasFrecuentes([cali, { ...cali, permitirEdicion: true }]).map((p) => p.pregunta)).not.toContain("¿Puedo cambiar mi respuesta después de enviarla?");
  });
  it("no puedo asistir: siempre, pidiendo que igual responda", () => {
    expect(preguntasFrecuentes([cali]).find((p) => p.pregunta === "¿Qué pasa si no puedo asistir?")!.respuesta).toMatch(/Entra igual con tu documento/);
  });
});
