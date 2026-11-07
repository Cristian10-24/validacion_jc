import { readFileSync } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { validarTelefono } from "@/lib/clausura/contacto";
import type { Evento } from "@/lib/clausura/db";
import { ContactoBody } from "@/lib/clausura/estudiante";
import { aceptaRespuestas, completarEjemplo, datosDesdeArchivo, EventoArchivo, formularioActivo } from "@/lib/clausura/evento";
import { localAIso } from "@/lib/clausura/gestion";
import { claveOtro, type Respuestas } from "@/lib/clausura/formulario/esquema";
import { camino, validarRespuestas } from "@/lib/clausura/formulario/motor";
import { ID_PRESENTA_PROYECTO } from "@/lib/clausura/formulario/proyecto";
import { documentoNumerico, esBasura, nombreValido, textoConSentido } from "@/lib/clausura/formulario/textos";
import { sinComentarios } from "@/lib/clausura/jsonc";

const leer = (n: string) => JSON.parse(sinComentarios(readFileSync(path.resolve(__dirname, "..", "eventos", n), "utf8")));
const evento = (n: string, extra: Partial<Evento> = {}): Evento => ({
  _id: new ObjectId(), ...datosDesdeArchivo(EventoArchivo.parse(completarEjemplo(leer(n)))), formularioVersion: 1,
  creadoEn: new Date(), actualizadoEn: new Date(), actualizadoPor: "prueba", ...extra,
});
const PLANES = { q_plan_estudios: "universidad", q_plan_trabajo: "trabajando", q_monitor_2027: "si", q_comunidad: "si", q_embajador: "no" };
const errores = (e: Evento, r: Respuestas) => {
  const v = validarRespuestas(formularioActivo(e, e.formulario), r);
  return v.ok ? [] : Object.keys(v.errores).sort();
};

describe("reglas de texto", () => {
  it("detecta texto basura", () => {
    for (const t of ["ffddgdffg", "GGHJH", "aaaaaa", "...", "12345", "xxxx yyyy"]) expect(esBasura(t), t).toBe(true);
    for (const t of ["Trabajo los sábados", "Madrina", "Intercambio en Brasil", "IoT en casa"]) expect(esBasura(t), t).toBe(false);
  });
  it("nombre: solo letras, mínimo dos palabras de 2+ letras", () => {
    for (const t of ["Rosa Gómez", "María José Ñáñez", "Juan de la Cruz", "Ana O'Neil"]) expect(nombreValido(t), t).toBe(true);
    for (const t of ["ffddgdffg", "Rosa", "R Gómez", "Rosa 123", "Rosa_Gómez", "ffdd gghh"]) expect(nombreValido(t), t).toBe(false);
  });
  it("documento: solo números, 6 a 10 dígitos", () => {
    expect(documentoNumerico("1.234.567")).toBe("1234567");
    expect(documentoNumerico("31 456 789")).toBe("31456789");
    for (const t of ["GGHJH", "12345", "12345678901", "1111111", "12AB3456"]) expect(documentoNumerico(t), t).toBeNull();
  });
  it("texto con mínimo y sentido", () => {
    expect(textoConSentido("no sé", 10)).toBe(false);
    expect(textoConSentido("aaaaaaaaaaaa", 10)).toBe(false);
    expect(textoConSentido("Tengo un viaje familiar", 10)).toBe(true);
  });
  it("celular: rechaza números repetidos, acepta los reales", () => {
    expect(validarTelefono("3000000000", "Cali").ok).toBe(false);
    expect(validarTelefono("300 111 1111", "Cali").ok).toBe(false);
    expect(validarTelefono("300 555 6677", "Cali").ok).toBe(true);
    expect(validarTelefono("6123 4567", "Ciudad de Panamá").ok).toBe(true);
  });
});

describe("validación del formulario real (servidor y navegador usan la misma)", () => {
  const CALI = evento("cali.json");
  const base = { q_asistencia: "si", q_acompanante: "si", q_acompanante_parentesco: "mama", q_proyecto_nombre: "Huerta TIC", ...PLANES };
  it('rechaza "ffddgdffg" como nombre y "GGHJH" como documento', () => {
    expect(errores(CALI, { ...base, q_acompanante_nombre: "ffddgdffg", q_acompanante_documento: "GGHJH" })).toEqual(["q_acompanante_documento", "q_acompanante_nombre"]);
  });
  it("acepta un nombre y documento reales", () => {
    expect(errores(CALI, { ...base, q_acompanante_nombre: "Rosa Gómez", q_acompanante_documento: "31.456.789" })).toEqual([]);
  });
  it('"Otro: ¿cuál?" no acepta texto basura ni de menos de 3 letras', () => {
    const r = { ...base, q_acompanante_nombre: "Rosa Gómez", q_acompanante_documento: "31456789", q_plan_estudios: "otro" };
    expect(errores(CALI, { ...r, [claveOtro("q_plan_estudios")]: "xx" })).toEqual([claveOtro("q_plan_estudios")]);
    expect(errores(CALI, { ...r, [claveOtro("q_plan_estudios")]: "sdfgh" })).toEqual([claveOtro("q_plan_estudios")]);
    expect(errores(CALI, { ...r, [claveOtro("q_plan_estudios")]: "Intercambio" })).toEqual([]);
  });
  it("la razón de no asistir exige un texto real de 10+ caracteres", () => {
    const r = { q_asistencia: "no", ...PLANES };
    expect(errores(CALI, { ...r, q_motivo_no_asiste: "no sé" })).toEqual(["q_motivo_no_asiste"]);
    expect(errores(CALI, { ...r, q_motivo_no_asiste: "hhhhhhhhhhhh" })).toEqual(["q_motivo_no_asiste"]);
    expect(errores(CALI, { ...r, q_motivo_no_asiste: "Viajo con mi familia" })).toEqual([]);
  });
  it("el nombre del proyecto no acepta basura (evento con proyecto obligatorio)", () => {
    expect(errores(evento("cali.json", { proyecto: "obligatorio" }), { ...base, q_acompanante: "no", q_proyecto_nombre: "jjjjj" })).toEqual(["q_proyecto_nombre"]);
  });
});

describe('"Tu género" es del estudiante (sección de contacto), no del acompañante', () => {
  it("el contacto exige el género", () => {
    const c = { correoConfirmado: true, celular: { usar: "prellenado" }, whatsapp: "mismo" };
    expect(ContactoBody.safeParse(c).success).toBe(false);
    expect(ContactoBody.safeParse({ ...c, genero: "no_binario" }).success).toBe(true);
    expect(ContactoBody.safeParse({ ...c, genero: "otro" }).success).toBe(false);
  });
  it("el formulario ya no pregunta el género del acompañante", () => {
    for (const n of ["cali.json", "cartagena.json"]) expect(JSON.stringify(leer(n))).not.toMatch(/genero/i);
  });
});

describe("proyecto por evento: obligatorio, opcional o no", () => {
  const r = { q_asistencia: "si", q_acompanante: "no", ...PLANES };
  const ruta = (e: Evento, x: Respuestas) => camino(formularioActivo(e, e.formulario), x).pasos.map((p) => p.seccion.id);

  it("hoy ningún evento pide el proyecto (Cali y Cartagena en \"no\")", () => {
    for (const n of ["cali.json", "cartagena.json"]) {
      const e = evento(n);
      expect(e.proyecto).toBe("no");
      expect(ruta(e, r)).not.toContain("s_proyecto");
      expect(errores(e, r)).toEqual([]);
    }
  });
  it("obligatorio (configurable para más adelante): la sección aparece sin preguntar y sus datos se exigen", () => {
    const e = evento("cali.json", { proyecto: "obligatorio" });
    expect(ruta(e, r)).toContain("s_proyecto");
    expect(errores(e, r)).toEqual(["q_proyecto_nombre"]);
    expect(JSON.stringify(formularioActivo(e, e.formulario))).not.toContain(ID_PRESENTA_PROYECTO);
  });
  it("opcional: primero pregunta si va a presentar; solo con Sí se exigen los datos", () => {
    const e = evento("cali.json", { proyecto: "opcional" });
    expect(errores(e, r)).toEqual([ID_PRESENTA_PROYECTO]);
    expect(errores(e, { ...r, [ID_PRESENTA_PROYECTO]: "no" })).toEqual([]);
    expect(errores(e, { ...r, [ID_PRESENTA_PROYECTO]: "si" })).toEqual(["q_proyecto_nombre"]);
    expect(errores(e, { ...r, [ID_PRESENTA_PROYECTO]: "si", q_proyecto_nombre: "Huerta TIC" })).toEqual([]);
  });
  it("no (Cartagena): no aparece nada del proyecto", () => {
    const e = evento("cartagena.json");
    expect(e.proyecto).toBe("no");
    expect(ruta(e, r)).not.toContain("s_proyecto");
    expect(errores(e, r)).toEqual([]);
  });
});

describe("respuestas legítimas que NO se deben rechazar", () => {
  it("siglas y nombres cortos: TIC, SENA, UdeA, CNC, HTML", () => {
    for (const t of ["TIC", "SENA", "UdeA", "CNC", "HTML", "Estudiar en el SENA", "Ingeniería en la UdeA", "Curso de TIC"]) {
      expect(esBasura(t), t).toBe(false);
      expect(textoConSentido(t, 2), t).toBe(true);
    }
  });
  it("nombres con guion o apóstrofo", () => {
    for (const t of ["María-José Pérez", "Luca D'Angelo", "Ana O’Neil", "Juan-Pablo de la Cruz"]) expect(nombreValido(t), t).toBe(true);
    for (const t of ["-María Pérez", "María- Pérez", "D' Angelo", "María--José Pérez"]) expect(nombreValido(t), t).toBe(false);
  });
  it('"Otro: ¿cuál?" acepta "SENA" y la razón acepta frases con siglas', () => {
    const CALI = evento("cali.json");
    const r = { q_asistencia: "no", q_motivo_no_asiste: "Tengo clase en el SENA", ...PLANES, q_plan_estudios: "otro", [claveOtro("q_plan_estudios")]: "SENA" };
    expect(errores(CALI, r)).toEqual([]);
  });
  it("el nombre del acompañante con guion o apóstrofo pasa y se guarda con mayúsculas", () => {
    const CALI = evento("cali.json");
    const v = validarRespuestas(formularioActivo(CALI, CALI.formulario), { q_asistencia: "si", q_acompanante: "si", q_acompanante_nombre: "maría-josé d'angelo", q_acompanante_documento: "31 456 789", q_acompanante_parentesco: "mama", ...PLANES });
    expect(v.ok).toBe(true);
    if (v.ok) expect([v.respuestas.q_acompanante_nombre, v.respuestas.q_acompanante_documento]).toEqual(["María-José D'Angelo", "31456789"]);
  });
});

describe("documento del acompañante: una sola regla", () => {
  it("solo números, 6 a 10 dígitos, sin puntos ni espacios; no hay pregunta de tipo de documento", () => {
    expect(documentoNumerico("123456")).toBe("123456");
    expect(documentoNumerico("1.234.567.890")).toBe("1234567890");
    expect(documentoNumerico("12345")).toBeNull();
    expect(documentoNumerico("12345678901")).toBeNull();
    expect(documentoNumerico("AB123456")).toBeNull();
    for (const n of ["cali.json", "cartagena.json"]) expect(JSON.stringify(leer(n))).not.toMatch(/tipo de documento|tipo_documento/i);
  });
});

describe("longitud del celular por país", () => {
  const casos: [string, string, string, string][] = [
    // ciudad, válido (sin indicativo), corto, con indicativo
    ["Cali", "300 555 6677", "300 555 667", "+57 300 555 6677"],
    ["Ciudad de Panamá", "6123 4567", "6123 456", "+507 6123 4567"],
    ["Quito", "99 123 4567", "99 123 456", "+593 99 123 4567"],
    ["Uruguay", "99 123 456", "99 123 45", "+598 99 123 456"],
  ];
  it.each(casos)("%s", (ciudad, ok, corto, conIndicativo) => {
    expect(validarTelefono(ok, ciudad).ok).toBe(true);
    expect(validarTelefono(corto, ciudad).ok).toBe(false);
    expect(validarTelefono(conIndicativo, ciudad).ok).toBe(true);
  });
  it("Colombia exige 10 dígitos y Panamá 8", () => {
    expect(validarTelefono("3005556677", "Cartagena").ok).toBe(true);
    expect(validarTelefono("300555667", "Cartagena").ok).toBe(false);
    expect(validarTelefono("61234567", "Ciudad de Panamá").ok).toBe(true);
    expect(validarTelefono("612345678", "Ciudad de Panamá").ok).toBe(false);
  });
});

describe("fecha límite en hora de Colombia (UTC-5)", () => {
  it("se guarda con la zona del evento y se compara contra ese instante", () => {
    const e = { estado: "abierto" as const, fechaLimite: new Date(localAIso("2026-11-12T23:59", "America/Bogota")) };
    expect(e.fechaLimite.toISOString()).toBe("2026-11-13T04:59:00.000Z");
    expect(aceptaRespuestas(e, new Date("2026-11-12T23:58:00-05:00"))).toBe(true);
    expect(aceptaRespuestas(e, new Date("2026-11-13T04:58:59Z"))).toBe(true);
    expect(aceptaRespuestas(e, new Date("2026-11-13T04:59:00Z"))).toBe(false);
    expect(aceptaRespuestas(e, new Date("2026-11-13T00:00:00-05:00"))).toBe(false);
  });
});
