import { describe, expect, it } from "vitest";
import { celularConIndicativo } from "@/lib/testimonios/celular";
import { compararTestimonios, estadoDe, parseMarcaTemporal, type FilaOrdenTestimonio } from "@/lib/testimonios/estado";

describe("estado", () => {
  it("realizado si llegó el video (aunque tenga comentarios), seguimiento si solo hay comentarios, pendiente si nada", () => {
    expect(estadoDe(1, 3)).toBe("realizado");
    expect(estadoDe(0, 1)).toBe("seguimiento");
    expect(estadoDe(0, 0)).toBe("pendiente");
  });
});

describe("marca temporal del Sheet", () => {
  it("dd/mm/aaaa h:mm:ss en hora de Colombia", () => {
    expect(new Date(parseMarcaTemporal("20/10/2026 9:10:00")!).toISOString()).toBe("2026-10-20T14:10:00.000Z");
    expect(new Date(parseMarcaTemporal("5/1/2026 18:05:07")!).toISOString()).toBe("2026-01-05T23:05:07.000Z");
  });
  it("también con a. m. / p. m. e ISO", () => {
    expect(new Date(parseMarcaTemporal("20/10/2026 2:30:00 p. m.")!).toISOString()).toBe("2026-10-20T19:30:00.000Z");
    expect(new Date(parseMarcaTemporal("20/10/2026 12:15:00 a. m.")!).toISOString()).toBe("2026-10-20T05:15:00.000Z");
    expect(parseMarcaTemporal("2026-10-20T15:30:00.000Z")).toBe(Date.parse("2026-10-20T15:30:00.000Z"));
  });
  it("texto que no es fecha → null", () => expect(parseMarcaTemporal("ayer")).toBeNull());
});

describe("orden de la lista", () => {
  const f = (nombre: string, estado: FilaOrdenTestimonio["estado"], envio: number | null = null, comentario: number | null = null): FilaOrdenTestimonio => ({ nombre, estado, ultimoEnvio: envio, ultimoComentario: comentario });
  const filas = [
    f("Zoe Pendiente", "pendiente"),
    f("Ana Realizada Vieja", "realizado", 100),
    f("Beto Seguimiento Viejo", "seguimiento", null, 50),
    f("Ángel Pendiente", "pendiente"),
    f("Carla Realizada Reciente", "realizado", 900),
    f("Dora Seguimiento Reciente", "seguimiento", null, 800),
  ];
  const orden = (estado?: FilaOrdenTestimonio["estado"]) => filas.filter((x) => !estado || x.estado === estado).sort(compararTestimonios).map((x) => x.nombre);
  it("Todos: seguimiento (comentario reciente primero), pendientes alfabéticos, realizados (envío reciente primero)", () => {
    expect(orden()).toEqual(["Dora Seguimiento Reciente", "Beto Seguimiento Viejo", "Ángel Pendiente", "Zoe Pendiente", "Carla Realizada Reciente", "Ana Realizada Vieja"]);
  });
  it("vistas filtradas", () => {
    expect(orden("realizado")).toEqual(["Carla Realizada Reciente", "Ana Realizada Vieja"]);
    expect(orden("pendiente")).toEqual(["Ángel Pendiente", "Zoe Pendiente"]);
  });
});

describe("celular con indicativo según la ciudad (solo presentación)", () => {
  it("agrega el indicativo del país de la ciudad", () => {
    expect(celularConIndicativo("3001112233", "Bogotá D.C.")).toBe("+57 300 111 2233");
    expect(celularConIndicativo("3001112233", "Medellín")).toBe("+57 300 111 2233");
    expect(celularConIndicativo("61234567", "Ciudad de Panamá")).toBe("+507 6123 4567");
    expect(celularConIndicativo("991234567", "Quito")).toBe("+593 99 123 4567");
    expect(celularConIndicativo("99123456", "Uruguay")).toBe("+598 99 123 456");
  });
  it("quita el 0 inicial de Ecuador y Uruguay", () => {
    expect(celularConIndicativo("099 123 456", "Uruguay")).toBe("+598 99 123 456");
    expect(celularConIndicativo("0991234567", "Guayaquil")).toBe("+593 99 123 4567");
    expect(celularConIndicativo("099123456", "Paysandú")).toBe("+598 99 123 456");
  });
  it("no duplica el indicativo si ya viene", () => {
    expect(celularConIndicativo("573001112233", "Cali")).toBe("+57 300 111 2233");
    expect(celularConIndicativo("+57 300-111-2233", "Cali")).toBe("+57 300 111 2233");
    expect(celularConIndicativo("+507 6123-4567", "Ciudad de Panamá")).toBe("+507 6123 4567");
    expect(celularConIndicativo("+593 099 123 4567", "Quito")).toBe("+593 99 123 4567");
    expect(celularConIndicativo("59899123456", "Uruguay")).toBe("+598 99 123 456");
    expect(celularConIndicativo("0059899123456", "Uruguay")).toBe("+598 99 123 456");
  });
  it("respeta un indicativo de otro país (número extranjero)", () => {
    expect(celularConIndicativo("+507 6123 4567", "Bogotá D.C.")).toBe("+507 6123 4567");
    expect(celularConIndicativo("+57 300 111 2233", "Uruguay")).toBe("+57 300 111 2233");
  });
  it("vacío o ciudad desconocida", () => {
    expect(celularConIndicativo("", "Cali")).toBe("");
    expect(celularConIndicativo(null, "Cali")).toBe("");
    expect(celularConIndicativo("3001112233", "Lima")).toBe("3001112233");
  });
});
