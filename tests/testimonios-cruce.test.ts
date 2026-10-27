import { describe, expect, it } from "vitest";
import { ciudadDelCatalogo, resolverCiudad } from "@/lib/testimonios/ciudades";
import {
  claveCelular, claveCorreo, claveDocumento, claveRespuesta, construirIndice, cruzar,
  normalizarRespuesta, separarEnlaces, type ParticipanteClaves,
} from "@/lib/testimonios/cruce";

describe("celular", () => {
  it("Colombia: con o sin +57, espacios o guiones → mismos 10 dígitos", () => {
    for (const v of ["+57 300 123 4567", "300-123-4567", "57 3001234567", "(300) 123 4567", "0057 300 123 4567"])
      expect(claveCelular(v), v).toBe("3001234567");
  });
  it("Panamá: +507 con o sin él", () => {
    for (const v of ["+507 6123-4567", "6123 4567", "507 61234567"]) expect(claveCelular(v), v).toBe("61234567");
  });
  it("Ecuador: +593 o el 0 nacional", () => {
    for (const v of ["+593 99 123 4567", "099 123 4567", "991234567"]) expect(claveCelular(v), v).toBe("991234567");
  });
  it("Uruguay: +598 o el 0 nacional", () => {
    for (const v of ["+598 94 123 456", "094 123 456", "94123456"]) expect(claveCelular(v), v).toBe("94123456");
  });
  it("muy corto o vacío no sirve para cruzar", () => {
    expect(claveCelular("12345")).toBeNull();
    expect(claveCelular("")).toBeNull();
    expect(claveCelular(undefined)).toBeNull();
  });
});

describe("documento, correo y enlaces", () => {
  it("documento sin puntos ni espacios; correo en minúsculas", () => {
    expect(claveDocumento("1.023.456 789")).toBe("1023456789");
    expect(claveCorreo("  Ana.Perez@Gmail.COM ")).toBe("ana.perez@gmail.com");
    expect(claveCorreo("sin-arroba")).toBeNull();
  });
  it("varios enlaces en la misma celda se guardan todos", () => {
    expect(separarEnlaces("https://drive.google.com/a, https://drive.google.com/b")).toEqual(["https://drive.google.com/a", "https://drive.google.com/b"]);
    expect(separarEnlaces("https://drive.google.com/a\nhttps://drive.google.com/b https://drive.google.com/a")).toEqual(["https://drive.google.com/a", "https://drive.google.com/b"]);
    expect(separarEnlaces("")).toEqual([]);
  });
  it("ciudad contra el catálogo fijo", () => {
    expect(ciudadDelCatalogo("bogota dc")).toBe("Bogotá D.C.");
    expect(ciudadDelCatalogo("MEDELLIN")).toBe("Medellín");
    expect(ciudadDelCatalogo("ciudad de panama")).toBe("Ciudad de Panamá");
    expect(ciudadDelCatalogo("Pasto")).toBeNull();
  });
  it("Paysandú y Colonia son Uruguay; se conserva el texto original", () => {
    for (const t of ["Paysandú", "paysandu", "PAYSANDÚ", " Paysandu ", "Colonia", "colonia", "COLONIA"])
      expect(resolverCiudad(t), t).toEqual({ ciudad: "Uruguay", ciudadOriginal: t.trim() });
    expect(resolverCiudad("Uruguay")).toEqual({ ciudad: "Uruguay", ciudadOriginal: null });
    expect(resolverCiudad("Bogotá")).toEqual({ ciudad: "Bogotá D.C.", ciudadOriginal: null });
  });
  it("en la respuesta del formulario, Paysandú queda como Uruguay con el original", () => {
    const r = normalizarRespuesta({ "Marca temporal": "x", "Ciudad a la que perteneces": "Paysandú" });
    expect([r.ciudad, r.ciudadOriginal]).toEqual(["Uruguay", "Paysandú"]);
    const otra = normalizarRespuesta({ "Marca temporal": "x", "Ciudad a la que perteneces": "Pasto" });
    expect([otra.ciudad, otra.ciudadOriginal]).toEqual(["Pasto", null]);
  });
});

describe("respuesta del formulario", () => {
  const fila = {
    "Marca temporal": "2026-10-20T15:30:00.000Z",
    "Nombre Completo": "  maría  JOSÉ gómez ",
    "Número de documento": "1.023.456.789",
    "Correo": "Maria.Gomez@Gmail.com",
    "Número de WhatsApp o Celular": "+57 300-123-4567",
    "Ciudad a la que perteneces": "Bogotá D.C.",
    "¡Sube aquí tu testimonio!": "https://drive.google.com/open?id=1, https://drive.google.com/open?id=2",
  };
  it("normaliza todas las columnas", () => {
    expect(normalizarRespuesta(fila)).toEqual({
      marcaTemporal: "2026-10-20T15:30:00.000Z", nombre: "María José Gómez", documento: "1023456789",
      correo: "maria.gomez@gmail.com", celular: "3001234567", ciudad: "Bogotá D.C.", ciudadOriginal: null,
      enlaces: ["https://drive.google.com/open?id=1", "https://drive.google.com/open?id=2"],
    });
  });
  it("respuestas anteriores sin la pregunta de celular", () => {
    const { ["Número de WhatsApp o Celular"]: _, ...vieja } = fila;
    expect(normalizarRespuesta(vieja).celular).toBeNull();
  });
  it("idempotencia: la misma respuesta da la misma clave; otra respuesta, otra clave", () => {
    const a = claveRespuesta(normalizarRespuesta(fila));
    expect(claveRespuesta(normalizarRespuesta({ ...fila }))).toBe(a);
    // los mismos enlaces en otro orden siguen siendo la misma respuesta
    expect(claveRespuesta(normalizarRespuesta({ ...fila, "¡Sube aquí tu testimonio!": "https://drive.google.com/open?id=2 https://drive.google.com/open?id=1" }))).toBe(a);
    expect(claveRespuesta(normalizarRespuesta({ ...fila, "Marca temporal": "2026-10-21T10:00:00.000Z" }))).not.toBe(a);
  });
});

describe("cruce", () => {
  const P: ParticipanteClaves[] = [
    { id: "A", documento: "1001", correo: "ana@gmail.com", celular: "3001112233" },
    { id: "B", documento: "1002", correo: "beto@gmail.com", celular: "3004445566" },
    { id: "C", documento: "1003", correo: "familia@gmail.com", celular: null },
    { id: "D", documento: "1004", correo: "familia@gmail.com", celular: "61234567" },
  ];
  const ix = construirIndice(P);

  it("coincide por documento", () => expect(cruzar({ documento: "1001", correo: null, celular: null }, ix)).toEqual({ cruce: "auto", participanteId: "A", por: "documento" }));
  it("coincide por correo (el documento no está en la lista)", () => expect(cruzar({ documento: "9999", correo: "beto@gmail.com", celular: null }, ix)).toEqual({ cruce: "auto", participanteId: "B", por: "correo" }));
  it("coincide por celular", () => expect(cruzar({ documento: null, correo: "otro@gmail.com", celular: "3001112233" }, ix)).toEqual({ cruce: "auto", participanteId: "A", por: "celular" }));
  it("correo y celular del mismo participante → se registra el correo", () =>
    expect(cruzar({ documento: null, correo: "ana@gmail.com", celular: "3001112233" }, ix)).toEqual({ cruce: "auto", participanteId: "A", por: "correo" }));
  it("todos los datos apuntan al mismo → decide el documento", () =>
    expect(cruzar({ documento: "1001", correo: "ana@gmail.com", celular: "3001112233" }, ix)).toEqual({ cruce: "auto", participanteId: "A", por: "documento" }));
  it("sin celular (respuestas viejas) cruza por documento o correo", () =>
    expect(cruzar({ documento: null, correo: "ana@gmail.com", celular: null }, ix)).toEqual({ cruce: "auto", participanteId: "A", por: "correo" }));
  it("no coincide con nadie → sin dueño", () => expect(cruzar({ documento: "7777", correo: "nadie@gmail.com", celular: "3009999999" }, ix)).toEqual({ cruce: "sin_duenio" }));
  it("sin ningún dato para cruzar → sin dueño", () => expect(cruzar({ documento: null, correo: null, celular: null }, ix)).toEqual({ cruce: "sin_duenio" }));

  it("gana el documento: documento de A con correo y celular de B → es de A", () =>
    expect(cruzar({ documento: "1001", correo: "beto@gmail.com", celular: "3004445566" }, ix)).toEqual({ cruce: "auto", participanteId: "A", por: "documento" }));
  it("hermanos que comparten correo: cada uno queda con su respuesta por documento", () => {
    // C y D tienen el mismo correo (familia@gmail.com); cada respuesta trae el documento de quien la envió.
    expect(cruzar({ documento: "1003", correo: "familia@gmail.com", celular: null }, ix)).toEqual({ cruce: "auto", participanteId: "C", por: "documento" });
    expect(cruzar({ documento: "1004", correo: "familia@gmail.com", celular: null }, ix)).toEqual({ cruce: "auto", participanteId: "D", por: "documento" });
  });
  it("hermanos que comparten correo y el documento no coincide → conflicto (no se adivina)", () =>
    expect(cruzar({ documento: "1.003-mal", correo: "familia@gmail.com", celular: null }, ix)).toEqual({ cruce: "conflicto", candidatos: ["C", "D"] }));
  it("hermanos que comparten correo, sin documento, pero con el celular de uno → conflicto", () =>
    // El correo apunta a C y D; el celular a D: son participantes distintos → no se asigna solo.
    expect(cruzar({ documento: null, correo: "familia@gmail.com", celular: "61234567" }, ix)).toEqual({ cruce: "conflicto", candidatos: ["C", "D"] }));
  it("sin documento: correo de A y celular de B → conflicto", () =>
    expect(cruzar({ documento: null, correo: "ana@gmail.com", celular: "3004445566" }, ix)).toEqual({ cruce: "conflicto", candidatos: ["A", "B"] }));
  it("el nombre no se usa para cruzar", () => {
    const r = normalizarRespuesta({ "Nombre Completo": "Ana", "Número de documento": "", "Correo": "" });
    expect(cruzar(r, ix)).toEqual({ cruce: "sin_duenio" });
  });
});
