import { readFileSync } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import type { Evento } from "@/lib/clausura/db";
import { completarEjemplo, datosDesdeArchivo, EventoArchivo, eventoVista, formularioActivo, revisarEventoArchivo } from "@/lib/clausura/evento";
import { aplicarAcompanante } from "@/lib/clausura/formulario/acompanante";
import type { Respuestas } from "@/lib/clausura/formulario/esquema";
import { camino, limpiar, validarFormulario, validarRespuestas } from "@/lib/clausura/formulario/motor";
import { aplicarProyecto } from "@/lib/clausura/formulario/proyecto";
import { DatosEvento } from "@/lib/clausura/gestion";
import { sinComentarios } from "@/lib/clausura/jsonc";
import { preguntasFrecuentes, respuestaAcompanante } from "@/lib/clausura/presentacion";

// Opción "¿Pueden llevar acompañante?" por evento. Sin el campo todo queda exactamente como antes.
const leer = (n: string) => JSON.parse(sinComentarios(readFileSync(path.resolve(__dirname, "..", "eventos", n), "utf8")));
const evento = (n: string, extra: Partial<Evento> = {}): Evento => ({
  _id: new ObjectId(), ...datosDesdeArchivo(EventoArchivo.parse(completarEjemplo(leer(n)))), formularioVersion: 1,
  creadoEn: new Date(), actualizadoEn: new Date(), actualizadoPor: "prueba", ...extra,
});
/** Como estaban guardados antes del cambio: sin el campo acompanante. */
const viejo = (n: string): Evento => { const { acompanante: _a, ...e } = evento(n); return e as Evento; };
const ruta = (e: Evento, r: Respuestas) => camino(formularioActivo(e, e.formulario), r).pasos.map((p) => p.seccion.id);
const ACOMP = { q_acompanante: "si", q_acompanante_nombre: "rosa gómez", q_acompanante_documento: "1234567", q_acompanante_parentesco: "mama" };

describe("sin el campo acompanante: todo igual que antes", () => {
  for (const n of ["cali.json", "cartagena.json"]) {
    it(`${n}: el formulario que se responde es el mismo de antes (solo la regla del proyecto)`, () => {
      const e = viejo(n);
      expect(e.acompanante).toBeUndefined();
      expect(formularioActivo(e, e.formulario)).toEqual(aplicarProyecto(e.formulario, e.proyecto ?? "no"));
      expect(eventoVista(e).acompanante).toBe("si");
      expect(ruta(e, { q_asistencia: "si" })).toContain("s_acompanante");
    });
  }
  it("los archivos de eventos se leen con acompanante \"si\" por defecto", () => {
    expect(EventoArchivo.parse(completarEjemplo(leer("cali.json"))).acompanante).toBe("si");
  });
  it("el formulario del admin sin el campo queda en \"si\"", () => {
    const d = {
      slug: "x-2026", tipo: "clausura", titulo: "Clausura 2026", kicker: "CLAUSURA 2026", nombreVisible: "X", ciudades: ["X"], descripcion: "",
      lugar: "L", direccion: "D", mapaUrl: null, zonaHoraria: "America/Bogota", inicio: "2026-11-20T09:00", fin: null, fechaLimite: null,
      imagen: null, permitirEdicion: false, proyecto: "no",
    };
    expect(DatosEvento.parse(d).acompanante).toBe("si");
    expect(DatosEvento.parse({ ...d, acompanante: "no" }).acompanante).toBe("no");
    expect(DatosEvento.safeParse({ ...d, acompanante: "talvez" }).success).toBe(false);
  });
  it("con \"si\" el formulario no cambia", () => {
    const e = evento("cartagena.json");
    expect(aplicarAcompanante(e.formulario, "si")).toBe(e.formulario);
  });
});

describe("con acompanante \"no\": la sección de acompañante no aparece", () => {
  for (const n of ["cali.json", "cartagena.json"]) {
    const con = evento(n);
    const sin = evento(n, { acompanante: "no" });
    it(`${n}: el evento es válido y el formulario resultante también`, () => {
      expect(revisarEventoArchivo(EventoArchivo.parse({ ...completarEjemplo(leer(n)), acompanante: "no" }))).toEqual([]);
      expect(validarFormulario(formularioActivo(sin, sin.formulario))).toEqual([]);
    });
    it(`${n}: "Sí" y "Tengo inconvenientes" siguen igual pero sin pasar por acompañante`, () => {
      for (const r of [{ q_asistencia: "si" }, { q_asistencia: "inconvenientes", q_inconveniente: "Transporte" }] as Respuestas[]) {
        expect(ruta(sin, r)).toEqual(ruta(con, r).filter((s) => s !== "s_acompanante"));
      }
    });
    it(`${n}: "No asistiré" no cambia`, () => {
      const r = { q_asistencia: "no", q_motivo_no_asiste: "Viaje" };
      expect(ruta(sin, r)).toEqual(ruta(con, r));
    });
    it(`${n}: no se exigen ni se guardan datos de acompañante`, () => {
      const f = formularioActivo(sin, sin.formulario);
      expect(validarRespuestas(f, { q_asistencia: "si" }, "s_asistencia").ok).toBe(true);
      expect(Object.keys(limpiar(f, { q_asistencia: "si", ...ACOMP }))).toEqual(["q_asistencia"]);
    });
    it(`${n}: las preguntas de acompañante siguen en el formulario guardado (archivadas en el que se responde)`, () => {
      const s = formularioActivo(sin, sin.formulario).secciones.find((x) => x.id === "s_acompanante");
      expect(s?.archivada).toBe(true);
      expect(sin.formulario.secciones.find((x) => x.id === "s_acompanante")?.archivada).toBeUndefined();
    });
  }
  it("si la sección de acompañante tiene \"despues\", los saltos van ahí", () => {
    const f = {
      secciones: [
        { id: "s_a", titulo: "A", items: [{ id: "q_a", tipo: "unica" as const, titulo: "¿Vas?", obligatoria: true, opciones: [{ id: "si", texto: "Sí", irA: { seccion: "s_acompanante" } }, { id: "no", texto: "No", irA: { seccion: "s_c" } }] }] },
        { id: "s_acompanante", titulo: "Acompañante", despues: { seccion: "s_c" }, items: [{ id: "q_acompanante", tipo: "sino" as const, titulo: "¿Llevas?", obligatoria: true }] },
        { id: "s_b", titulo: "B", items: [{ id: "q_b", tipo: "texto" as const, titulo: "B", obligatoria: false }] },
        { id: "s_c", titulo: "C", items: [{ id: "q_c", tipo: "texto" as const, titulo: "C", obligatoria: false }] },
      ],
    };
    const g = aplicarAcompanante(f, "no");
    expect(camino(g, { q_a: "si" }).pasos.map((p) => p.seccion.id)).toEqual(["s_a", "s_c"]);
    expect(validarFormulario(g)).toEqual([]);
  });
});

describe("preguntas frecuentes según cada ciudad", () => {
  const faq = (e: Evento) => ({ formulario: formularioActivo(e, e.formulario), permitirEdicion: e.permitirEdicion, acompanante: e.acompanante });
  const cali = evento("cali.json");
  const ctg = evento("cartagena.json");
  const ctgNo = evento("cartagena.json", { acompanante: "no" });
  const caliNo = evento("cali.json", { acompanante: "no" });

  it("sin el campo: la misma respuesta de antes", () => {
    const antes = { pregunta: "¿Puedo llevar un acompañante?", respuesta: "Puedes llevar solo un acompañante. Lo indicas en el formulario." };
    expect(preguntasFrecuentes([viejo("cali.json"), viejo("cartagena.json")].map((e) => ({ formulario: formularioActivo(e, e.formulario), permitirEdicion: e.permitirEdicion })))[0]).toEqual(antes);
    expect(preguntasFrecuentes([cali, ctg].map(faq))[0]).toEqual(antes);
  });
  it("ninguna ciudad lleva acompañante: responde que no", () => {
    expect(respuestaAcompanante([caliNo, ctgNo].map(faq))).toBe("No. Para la clausura no se permiten acompañantes.");
    expect(respuestaAcompanante([ctgNo].map(faq))).toMatch(/^No\./);
  });
  it("unas sí y otras no: dice que depende de la ciudad, sin nombrar ninguna", () => {
    const r = respuestaAcompanante([cali, ctgNo].map(faq));
    expect(r).toBe("Depende de tu ciudad. En las ciudades donde se permite, puedes llevar solo un acompañante y lo indicas en el formulario.");
    expect(r).not.toMatch(/Cali|Cartagena/);
  });
  it("las demás preguntas no cambian", () => {
    const p = preguntasFrecuentes([cali, ctgNo].map(faq)).map((x) => x.pregunta);
    expect(p).toEqual(["¿Puedo llevar un acompañante?", "¿Qué pasa si no puedo asistir?", "¿Puedo cambiar mi respuesta después de enviarla?"]);
  });
});
