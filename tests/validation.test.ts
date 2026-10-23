import { describe, expect, it } from "vitest";
import { checkEmail, emailError } from "@/lib/validation/email";
import { nameWarnings, normalizeCity, normalizeDocumento, toProperName } from "@/lib/validation/name";

describe("toProperName", () => {
  it("normaliza mayúsculas, espacios y partículas", () => {
    expect(toProperName("  MARÍA  DE LOS ángeles  PÉREZ ")).toBe("María de los Ángeles Pérez");
    expect(toProperName("juan del castillo y rojas")).toBe("Juan del Castillo y Rojas");
  });
  it("capitaliza la primera palabra aunque sea partícula", () => {
    expect(toProperName("de la torre ana")).toBe("De la Torre Ana");
  });
  it("respeta guiones y apóstrofos", () => {
    expect(toProperName("maría-josé d'angelo")).toBe("María-José D'Angelo");
    expect(toProperName("BOGOTÁ D.C")).toBe("Bogotá D.C");
  });
  it("no agrega tildes", () => {
    expect(toProperName("jose martinez")).toBe("Jose Martinez");
  });
});

describe("nameWarnings", () => {
  it("avisa si no hay tildes", () => {
    expect(nameWarnings("Jose Martinez")).toContain("sin_tildes");
    expect(nameWarnings("José Martínez")).toEqual([]);
  });
  it("avisa si el nombre está incompleto", () => {
    expect(nameWarnings("Sofía")).toContain("incompleto");
  });
});

describe("normalizeCity", () => {
  it("usa el nombre oficial de Bogotá", () => {
    for (const v of ["Bogotá D.C", "BOGOTA D.C.", "bogota dc", "Bogotá"]) expect(normalizeCity(v), v).toBe("Bogotá D.C.");
  });
  it("normaliza las demás con Nombre Propio", () => {
    expect(normalizeCity("ciudad de panamá")).toBe("Ciudad de Panamá");
    expect(normalizeCity("URUGUAY")).toBe("Uruguay");
  });
});

describe("normalizeDocumento", () => {
  it("quita puntos y espacios", () => {
    expect(normalizeDocumento("1.023.456 789")).toBe("1023456789");
  });
});

describe("checkEmail", () => {
  it("normaliza y acepta correos personales", () => {
    const c = checkEmail("  Ana.Perez@Gmail.com ");
    expect(c).toEqual({ email: "ana.perez@gmail.com", valid: true, educational: false, suggestion: null });
    expect(emailError(c)).toBeNull();
  });
  it("rechaza formato inválido", () => {
    expect(checkEmail("ana@gmail").valid).toBe(false);
    expect(checkEmail("ana.gmail.com").valid).toBe(false);
  });
  it("detecta dominios educativos", () => {
    for (const e of ["a@misena.edu.co", "a@soy.sena.edu.co", "a@colegio.edu.co", "a@mit.edu", "a@bogota.gov.co"]) {
      const c = checkEmail(e);
      expect(c.educational, e).toBe(true);
      expect(emailError(c)).not.toBeNull();
    }
    expect(checkEmail("a@educacion.com").educational).toBe(false);
  });
  it("sugiere correcciones de dominio", () => {
    expect(checkEmail("ana@gmial.com").suggestion).toBe("ana@gmail.com");
    expect(checkEmail("ana@gmail.co").suggestion).toBe("ana@gmail.com");
    expect(checkEmail("ana@hotmial.com").suggestion).toBe("ana@hotmail.com");
    expect(checkEmail("ana@gnail.com").suggestion).toBe("ana@gmail.com");
    expect(checkEmail("ana@outlook.es").suggestion).toBeNull();
    expect(checkEmail("ana@mail.com").suggestion).toBeNull();
    expect(checkEmail("ana@empresa.com.co").suggestion).toBeNull();
  });
});

describe("leerFilas (importación)", () => {
  it("normaliza, une nombres y apellidos y detecta errores por fila", async () => {
    const { leerFilas } = await import("@/lib/importer");
    const r = leerFilas([
      { nombres: "JOSÉ", apellidos: "pérez  gómez", email: " Jose@Gmail.com ", id: "1.023.456", ciudad: "bogota d.c" },
      { nombres: "Ana", apellidos: "Ruiz", email: "ana@misena.edu.co", id: "555", ciudad: "Cali" },
      { nombres: "Repetido", apellidos: "X", email: "", id: "1023456", ciudad: "Cali" },
      { nombres: "Sin", apellidos: "Ciudad", email: "a@gmail.com", id: "777", ciudad: "" },
      { nombres: "Sin", apellidos: "Documento", email: "a@gmail.com", id: "", ciudad: "Cali" },
    ]);
    expect(r.filas.map((f) => [f.documento, f.nombre, f.correo, f.ciudad])).toEqual([
      ["1023456", "José Pérez Gómez", "jose@gmail.com", "Bogotá D.C."],
      ["555", "Ana Ruiz", "ana@misena.edu.co", "Cali"],
    ]);
    expect(r.errores.map((e) => `${e.fila}:${e.mensaje}`)).toEqual(["4:Documento repetido en el archivo", "5:Sin ciudad", "6:Sin número de documento"]);
    expect(r.avisos.map((a) => a.fila)).toEqual([3]);
  });
});
