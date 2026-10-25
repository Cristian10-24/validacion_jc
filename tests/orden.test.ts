import { describe, expect, it } from "vitest";
import { compararFilas, type FilaOrdenable } from "@/lib/orden";

const f = (nombre: string, estado: FilaOrdenable["estado"], fecha: string | null = null): FilaOrdenable => ({ nombre, estado, fecha });
const filas = [
  f("Zoe Pendiente", "pendiente"),
  f("Ana Validada Vieja", "validado", "2026-10-20T10:00:00Z"),
  f("Ángel Pendiente", "pendiente"),
  f("Carla Corregida Reciente", "corregido", "2026-10-24T09:00:00Z"),
  f("Beto Validado Reciente", "validado", "2026-10-23T18:00:00Z"),
  f("Bruno Pendiente", "pendiente"),
  f("Dora Corregida Vieja", "corregido", "2026-10-21T08:00:00Z"),
];
const nombres = (estado?: FilaOrdenable["estado"]) => filas.filter((r) => !estado || r.estado === estado).sort(compararFilas).map((r) => r.nombre);

describe("orden de la lista", () => {
  it("Todos: validados y corregidos del más reciente al más antiguo, luego pendientes alfabéticos", () => {
    expect(nombres()).toEqual([
      "Carla Corregida Reciente", "Beto Validado Reciente", "Dora Corregida Vieja", "Ana Validada Vieja",
      "Ángel Pendiente", "Bruno Pendiente", "Zoe Pendiente",
    ]);
  });
  it("Validado: el más reciente primero", () => expect(nombres("validado")).toEqual(["Beto Validado Reciente", "Ana Validada Vieja"]));
  it("Corregido: el más reciente primero", () => expect(nombres("corregido")).toEqual(["Carla Corregida Reciente", "Dora Corregida Vieja"]));
  it("Pendiente: alfabético, con tildes en su lugar", () => expect(nombres("pendiente")).toEqual(["Ángel Pendiente", "Bruno Pendiente", "Zoe Pendiente"]));
  it("en un corregido se ordena por el nombre propuesto", () => {
    const a = { ...f("Zeta", "pendiente"), nombrePropuesto: null };
    const b = f("Alfa", "pendiente");
    expect([a, b].sort(compararFilas).map((r) => r.nombre)).toEqual(["Alfa", "Zeta"]);
  });
});
