import { readFileSync } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { enlaceGoogle, escaparIcs, generarIcs } from "@/lib/clausura/calendario";
import type { Evento } from "@/lib/clausura/db";
import { completarEjemplo, datosDesdeArchivo, EventoArchivo, eventoVista, formularioActivo, pendientesDe } from "@/lib/clausura/evento";
import { claveOtro, type Respuestas } from "@/lib/clausura/formulario/esquema";
import { respuestasLegibles } from "@/lib/clausura/formulario/mostrar";
import { camino, limpiar, validarRespuestas } from "@/lib/clausura/formulario/motor";
import { sinComentarios } from "@/lib/clausura/jsonc";

// Los formularios REALES de eventos/cali.json (EXPOFeria) y eventos/cartagena.json (clausura).
const leer = (n: string) => JSON.parse(sinComentarios(readFileSync(path.resolve(__dirname, "..", "eventos", n), "utf8")));
const evento = (n: string): Evento => {
  const datos = datosDesdeArchivo(EventoArchivo.parse(completarEjemplo(leer(n))));
  return { _id: new ObjectId(), ...datos, formularioVersion: 1, creadoEn: new Date(), actualizadoEn: new Date(), actualizadoPor: "prueba" };
};
const CALI = evento("cali.json");
const CTG = evento("cartagena.json");
const activo = (e: Evento) => formularioActivo(e, e.formulario);
const ruta = (e: Evento, r: Respuestas) => camino(activo(e), r).pasos.map((p) => p.seccion.id);

const PLANES = { q_plan_estudios: "universidad", q_plan_trabajo: "trabajando", q_monitor_2027: "si", q_comunidad: "si", q_embajador: "no" };
const ACOMP = { q_acompanante: "si", q_acompanante_nombre: "rosa gómez", q_acompanante_documento: "1.234.567", q_acompanante_parentesco: "mama" };

describe("Cali (EXPOFeria): las tres ramas de asistencia", () => {
  it("Sí → acompañante → planes (Cali hoy no pide proyecto)", () => {
    expect(ruta(CALI, { q_asistencia: "si" })).toEqual(["s_asistencia", "s_acompanante", "s_planes", "s_monitor", "s_comunidad"]);
  });
  it("Tengo inconvenientes → inconvenientes → acompañante → planes", () => {
    expect(ruta(CALI, { q_asistencia: "inconvenientes" })).toEqual(["s_asistencia", "s_inconvenientes", "s_acompanante", "s_planes", "s_monitor", "s_comunidad"]);
  });
  it("No → no asistiré → planes (sin acompañante ni proyecto)", () => {
    expect(ruta(CALI, { q_asistencia: "no" })).toEqual(["s_asistencia", "s_no_asiste", "s_planes", "s_monitor", "s_comunidad"]);
  });
  it("Sí con acompañante: todo completo es válido y el documento se guarda normalizado", () => {
    const v = validarRespuestas(activo(CALI), { q_asistencia: "si", ...ACOMP, q_proyecto_nombre: "Huerta TIC", q_proyecto_enlace: "https://github.com/ana/huerta", ...PLANES });
    expect(v.ok).toBe(true);
    if (v.ok) expect([v.respuestas.q_acompanante_documento, v.respuestas.q_acompanante_nombre]).toEqual(["1234567", "Rosa Gómez"]);
  });
  it("Inconvenientes sin acompañante: el inconveniente es obligatorio; no pide datos del acompañante", () => {
    const base = { q_asistencia: "inconvenientes", q_acompanante: "no", q_proyecto_nombre: "Huerta TIC", ...PLANES };
    const sin = validarRespuestas(activo(CALI), base);
    expect(sin.ok).toBe(false);
    if (!sin.ok) expect(Object.keys(sin.errores)).toEqual(["q_inconveniente"]);
    expect(validarRespuestas(activo(CALI), { ...base, q_inconveniente: "Trabajo los sábados" }).ok).toBe(true);
  });
  it("No: no pide acompañante ni proyecto, sí la razón (obligatoria) y las 5 preguntas de planes", () => {
    const v = validarRespuestas(activo(CALI), { q_asistencia: "no" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errores).sort()).toEqual(["q_comunidad", "q_embajador", "q_monitor_2027", "q_motivo_no_asiste", "q_plan_estudios", "q_plan_trabajo"]);
    expect(validarRespuestas(activo(CALI), { q_asistencia: "no", q_motivo_no_asiste: "Viajo ese día", ...PLANES }).ok).toBe(true);
  });
  it("cambiar de Sí a No descarta acompañante y proyecto", () => {
    const r = limpiar(activo(CALI), { q_asistencia: "no", ...ACOMP, q_proyecto_nombre: "Huerta TIC", q_motivo_no_asiste: "Viaje", ...PLANES });
    expect(Object.keys(r).sort()).toEqual(["q_asistencia", "q_comunidad", "q_embajador", "q_monitor_2027", "q_motivo_no_asiste", "q_plan_estudios", "q_plan_trabajo"]);
  });
  it("con proyecto obligatorio: el enlace es opcional, pero si se escribe debe ser una URL", () => {
    const CALI_P = { ...CALI, proyecto: "obligatorio" as const };
    const base = { q_asistencia: "si", q_acompanante: "no", q_proyecto_nombre: "Huerta TIC", ...PLANES };
    expect(validarRespuestas(activo(CALI_P), base).ok).toBe(true);
    const v = validarRespuestas(activo(CALI_P), { ...base, q_proyecto_enlace: "mi proyecto" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errores)).toEqual(["q_proyecto_enlace"]);
  });
  it("el documento del acompañante solo admite dígitos y letras", () => {
    const v = validarRespuestas(activo(CALI), { q_asistencia: "si", ...ACOMP, q_acompanante_documento: "12#45", q_proyecto_nombre: "Huerta TIC", ...PLANES });
    expect(v.ok).toBe(false);
  });
});

describe("Cartagena (clausura): sin sección de proyecto", () => {
  it("ninguna rama pasa por proyecto", () => {
    for (const a of ["si", "inconvenientes", "no"]) expect(ruta(CTG, { q_asistencia: a })).not.toContain("s_proyecto");
    expect(ruta(CTG, { q_asistencia: "si" })).toEqual(["s_asistencia", "s_acompanante", "s_planes", "s_monitor", "s_comunidad"]);
  });
  it("los dos eventos usan los mismos IDs en las preguntas comunes", () => {
    const ids = (e: Evento) => e.formulario.secciones.flatMap((s) => s.items.map((i) => i.id));
    expect(ids(CTG)).toEqual(ids(CALI));
  });
});

describe('"Otro: ¿cuál?"', () => {
  const base = { q_asistencia: "no", q_motivo_no_asiste: "Viajo con mi familia", ...PLANES };
  it("exige el texto cuando se elige Otro", () => {
    const v = validarRespuestas(activo(CALI), { ...base, q_plan_estudios: "otro" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errores[claveOtro("q_plan_estudios")]).toBe("Escribe cuál.");
    expect(validarRespuestas(activo(CALI), { ...base, q_plan_estudios: "otro", [claveOtro("q_plan_estudios")]: "Un intercambio" }).ok).toBe(true);
  });
  it("también en el desplegable de parentesco", () => {
    const v = validarRespuestas(activo(CALI), { q_asistencia: "si", ...ACOMP, q_acompanante_parentesco: "otro", q_proyecto_nombre: "Huerta TIC", ...PLANES });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errores)).toEqual([claveOtro("q_acompanante_parentesco")]);
  });
  it("si cambia a otra opción, el texto de Otro se descarta", () => {
    expect(limpiar(activo(CALI), { ...base, [claveOtro("q_plan_estudios")]: "x" })).not.toHaveProperty(claveOtro("q_plan_estudios"));
  });
  it('se muestra como "Otro: <texto>"', () => {
    const r = { ...base, q_plan_trabajo: "otro", [claveOtro("q_plan_trabajo")]: "Voluntariado" };
    const planes = respuestasLegibles(activo(CALI), r).find((s) => s.id === "s_planes")!;
    expect(planes.preguntas.find((p) => p.id === "q_plan_trabajo")!.texto).toBe("Otro: Voluntariado");
  });
});

describe("textos según el tipo y la fecha del evento", () => {
  const pregunta = (e: Evento) => eventoVista(e).formulario.secciones[0]!.items[0]!.titulo;
  it("Cali", () => expect(pregunta(CALI)).toBe("Asistiré a la EXPOFeria y clausura el sábado 14 de noviembre a las 9:00 a. m."));
  it("Cartagena", () => expect(pregunta(CTG)).toBe("Asistiré a la clausura el jueves 19 de noviembre a las 3:00 p. m."));
  it("bloques con {evento}", () => {
    const acomp = eventoVista(CTG).formulario.secciones.find((s) => s.id === "s_acompanante")!.items[0]!;
    expect("texto" in acomp && acomp.texto).toMatch(/^Para la clausura puedes llevar solo un acompañante\./);
  });
  it("tipo, kicker y título", () => {
    expect(eventoVista(CALI)).toMatchObject({ tipo: "expoferia", nombreTipo: "EXPOFeria y clausura", kicker: "EXPOFERIA 2026", titulo: "EXPOFeria y clausura 2026" });
    expect(eventoVista(CTG)).toMatchObject({ tipo: "clausura", nombreTipo: "Clausura", kicker: "CLAUSURA 2026", titulo: "Clausura 2026" });
  });
});

describe("[POR DEFINIR]", () => {
  it("los JSON reales ya no tienen datos pendientes", () => {
    expect(pendientesDe(leer("cali.json"))).toEqual([]);
    expect(pendientesDe(leer("cartagena.json"))).toEqual([]);
  });
  it("fecha límite: lunes 9 de noviembre, 11:59 p. m. en hora de Colombia (04:59 UTC del martes)", () => {
    expect(CALI.fechaLimite!.toISOString()).toBe("2026-11-10T04:59:00.000Z");
    expect(CTG.fechaLimite!.toISOString()).toBe("2026-11-10T04:59:00.000Z");
  });
  it("citación: Cali 8:30 a. m. (evento a las 9:00); Cartagena 2:30 p. m. (evento a las 3:00)", () => {
    expect(eventoVista(CALI)).toMatchObject({ llegada: "8:30 a. m.", hora: "9:00 a. m. – 12:00 p. m. (hora de Colombia)" });
    expect(eventoVista(CTG)).toMatchObject({ llegada: "2:30 p. m.", hora: "3:00 p. m. – 5:00 p. m. (hora de Colombia)" });
  });
  it("detecta textos y fechas pendientes en cualquier campo", () => {
    expect(pendientesDe({ lugar: "[POR DEFINIR]", inicio: "2026-11-19T[POR DEFINIR]", $comentario: "[POR DEFINIR]", formulario: { a: ["ok", "x [POR DEFINIR]"] } }))
      .toEqual(["lugar", "inicio", "formulario.a.1"]);
  });
});

describe("calendario (.ics y Google Calendar)", () => {
  const ics = generarIcs(CALI, new Date("2026-11-06T12:00:00Z"));
  const lineas = ics.split("\r\n");
  it("usa CRLF en todas las líneas y termina en CRLF", () => {
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("ninguna línea pasa de 75 bytes (las largas se pliegan con un espacio)", () => {
    for (const l of lineas) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
    expect(lineas.some((l) => l.startsWith(" "))).toBe(true);
  });
  it("empieza a la hora de citación (8:30 a. m. en Bogotá = 13:30 UTC) y termina a las 12:00 p. m.", () => {
    const desplegado = ics.replace(/\r\n /g, "");
    expect(desplegado).toContain("DTSTART:20261114T133000Z");
    expect(desplegado).toContain("Llegada: 8:30 a. m. · Inicio: 9:00 a. m.");
    expect(desplegado).toContain("DTEND:20261114T170000Z");
    expect(desplegado).toMatch(/BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT[\s\S]*END:VEVENT[\s\S]*END:VCALENDAR/);
  });
  it("lugar, dirección y mapa, con comas y punto y coma escapados", () => {
    const desplegado = ics.replace(/\r\n /g, "");
    expect(desplegado).toContain("LOCATION:Universidad Católica\\, Carrera 94 #4c-04\\, Barrio Meléndez\\, Cali");
    expect(desplegado).toMatch(/DESCRIPTION:.*Cómo llegar: https:\/\/www\.google\.com\/maps/);
    expect(escaparIcs("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });
  it("enlace de Google Calendar con fechas, título y lugar", () => {
    const u = new URL(enlaceGoogle(CTG));
    expect(u.searchParams.get("dates")).toBe("20261119T193000Z/20261119T220000Z");
    expect(u.searchParams.get("details")).toContain("Llegada: 2:30 p. m. · Inicio: 3:00 p. m.");
    expect(u.searchParams.get("text")).toBe("Clausura 2026 · Jóvenes creaTIvos");
    expect(u.searchParams.get("location")).toContain("Pie de la Popa");
  });
});
