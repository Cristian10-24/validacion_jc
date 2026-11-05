import { describe, expect, it } from "vitest";
import { asignarRespuestas, claveRespuestaEncuesta, indiceEncuesta, normalizarRespuestaEncuesta, type RespuestaCruce } from "@/lib/encuesta/cruce";
import { buscarEncuesta, compararEncuesta } from "@/lib/encuesta/orden";
import { contarEncuestaPorCiudad } from "@/lib/encuesta/resumen";

const FILA = {
  "Marca temporal": "03/11/2026 14:05:10",
  "Correo electrónico": " Ana.Ruiz@Gmail.com ",
  "Nombre completo": "ANA  ruiz",
  "Número de documento de identidad": "0.012.345-6",
  "A qué ciudad pertenece tu grupo?": "bogota",
};

describe("normalización de la respuesta", () => {
  it("documento sin puntos, guiones ni espacios y con ceros a la izquierda; correo en minúsculas", () => {
    const n = normalizarRespuestaEncuesta(FILA);
    expect(n).toMatchObject({ marcaTemporal: "03/11/2026 14:05:10", documento: "00123456", correo: "ana.ruiz@gmail.com", nombre: "Ana Ruiz" });
  });
  it("la misma respuesta da la misma clave; otra marca temporal, otra clave", () => {
    const a = claveRespuestaEncuesta(normalizarRespuestaEncuesta(FILA));
    expect(claveRespuestaEncuesta(normalizarRespuestaEncuesta({ ...FILA }))).toBe(a);
    expect(claveRespuestaEncuesta(normalizarRespuestaEncuesta({ ...FILA, "Marca temporal": "04/11/2026 9:00:00" }))).not.toBe(a);
  });
});

const ix = indiceEncuesta([
  { id: "p1", documento: "00123456", correo: "ana.ruiz@gmail.com" },
  { id: "p2", documento: "999", correo: "familia@gmail.com" },
  { id: "p3", documento: "888", correo: "familia@gmail.com" },
  { id: "p4", documento: "777", correo: "luis@gmail.com" },
]);
let n = 0;
const resp = (documento: string | null, correo: string | null, marcaTemporal = "01/11/2026 10:00:00"): RespuestaCruce & { id: string } =>
  ({ id: `r${++n}`, marcaTemporal, recibidaEn: new Date("2026-11-05T00:00:00Z"), norm: { documento, correo } });

describe("cruce con participantes", () => {
  it("gana el documento aunque el correo sea de otra persona", () => {
    const { porParticipante } = asignarRespuestas([resp("00123456", "luis@gmail.com")], ix);
    expect(porParticipante.get("p1")?.por).toBe("documento");
    expect(porParticipante.has("p4")).toBe(false);
  });
  it("los ceros a la izquierda cuentan: 123456 no es 00123456", () => {
    const { porParticipante, noAsignadas } = asignarRespuestas([resp("123456", null)], ix);
    expect(porParticipante.size).toBe(0);
    expect(noAsignadas[0].motivo).toBe("sin_coincidencia");
  });
  it("si el documento no coincide, cruza por correo", () => {
    const { porParticipante } = asignarRespuestas([resp("000", "luis@gmail.com")], ix);
    expect(porParticipante.get("p4")?.por).toBe("correo");
  });
  it("un correo de varias personas no se asigna: queda en conflicto para revisar", () => {
    const { porParticipante, noAsignadas } = asignarRespuestas([resp(null, "familia@gmail.com")], ix);
    expect(porParticipante.size).toBe(0);
    expect(noAsignadas[0]).toMatchObject({ motivo: "conflicto", candidatos: ["p2", "p3"] });
  });
  it("si respondió varias veces cuenta la más reciente (por marca temporal, no por orden de llegada)", () => {
    const nueva = resp("777", null, "02/11/2026 8:00:00");
    const vieja = resp(null, "luis@gmail.com", "30/10/2026 18:00:00");
    const { porParticipante } = asignarRespuestas([nueva, vieja], ix);
    expect(porParticipante.get("p4")).toMatchObject({ respuesta: { id: nueva.id }, por: "documento", total: 2 });
  });
});

describe("resumen por ciudad", () => {
  it("cuenta respondieron y faltan, de menor a mayor avance", () => {
    const { total, ciudades } = contarEncuestaPorCiudad([
      { ciudad: "Cali", estado: "respondio", conComentarios: false },
      { ciudad: "Cali", estado: "respondio", conComentarios: false },
      { ciudad: "Bogotá", estado: "respondio", conComentarios: false },
      { ciudad: "Bogotá", estado: "pendiente", conComentarios: true },
      { ciudad: "Bogotá", estado: "pendiente", conComentarios: false },
    ], new Map([["Cali", ["Marta"]]]));
    expect(total).toEqual({ total: 5, respondio: 3, pendiente: 2, conComentarios: 1 });
    expect(ciudades.map((c) => [c.ciudad, c.respondio, c.pendiente, c.monitores])).toEqual([["Bogotá", 1, 2, []], ["Cali", 2, 0, ["Marta"]]]);
  });
});

describe("orden y búsqueda", () => {
  it("pendientes sin comentarios, luego con comentarios, luego los que respondieron", () => {
    const filas = [
      { nombre: "Zoe", estado: "respondio" as const, ultimaRespuesta: 5, ultimoComentario: null },
      { nombre: "Beto", estado: "pendiente" as const, ultimaRespuesta: null, ultimoComentario: 10 },
      { nombre: "Ana", estado: "pendiente" as const, ultimaRespuesta: null, ultimoComentario: null },
    ];
    expect([...filas].sort(compararEncuesta).map((f) => f.nombre)).toEqual(["Ana", "Beto", "Zoe"]);
  });
  it("busca sin tildes y por documento", () => {
    const filas = [{ nombre: "José Núñez", documento: "00123", correo: "", celular: "" }, { nombre: "Ana", documento: "555", correo: "", celular: "" }];
    expect(buscarEncuesta(filas, "jose nunez").map((f) => f.nombre)).toEqual(["José Núñez"]);
    expect(buscarEncuesta(filas, "00123").map((f) => f.nombre)).toEqual(["José Núñez"]);
  });
});
