import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buscarTestimonios, compararDuplicados, esBusquedaDuplicados } from "@/lib/testimonios/busqueda";
import type { FilaTestimonio } from "@/lib/testimonios/vista";

// Búsqueda "duplicados": con lo que devuelve el servidor (alcance por ciudad incluido), base EN MEMORIA.
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
vi.mock("@/lib/db", () => ({ collections: async () => ({ users: { findOne: async () => estado.usuario } }), getDb: () => { throw new Error("no"); } }));

type Doc = Record<string, unknown>;
const mem = vi.hoisted(() => ({ participantes: [] as Doc[], respuestas: [] as Doc[], comentarios: [] as Doc[] }));
vi.mock("@/lib/testimonios/db", () => {
  const cumple = (d: Doc, q: Doc) => Object.entries(q).every(([k, v]) => {
    if (v && typeof v === "object" && "$in" in (v as object)) return (v as { $in: unknown[] }).$in.some((y) => String(y) === String(d[k]));
    return String(d[k]) === String(v);
  });
  const col = (arr: Doc[]) => ({ find: (q: Doc = {}) => { const r = arr.filter((d) => cumple(d, q)); const cur = { toArray: async () => r, sort: () => cur }; return cur; } });
  return { testimonios: async () => ({ participantes: col(mem.participantes), respuestas: col(mem.respuestas), comentarios: col(mem.comentarios) }) };
});

async function como(rol: "monitor" | "coordinador", ciudades: string[] = []) {
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: `u-${rol}`, nombre: rol, rol, ciudades, activo: true, tokenVersion: 0 };
  estado.token = createToken(_id.toHexString(), 0);
}
const filas = async (): Promise<FilaTestimonio[]> => { const { GET } = await import("@/app/api/testimonios/route"); return (await (await GET()).json()).filas; };
const nombres = (fs: FilaTestimonio[]) => fs.map((f) => f.nombre);

const p = (nombre: string, ciudad: string) => { const _id = new ObjectId(); mem.participantes.push({ _id, documento: nombre, nombre, ciudad, celular: "", correo: "" }); return _id; };
const envio = (participanteId: ObjectId, cruce: string, fecha: string) =>
  mem.respuestas.push({ _id: new ObjectId(), participanteId, cruce, marcaTemporal: fecha, recibidaEn: new Date(), enlaces: [`https://drive.google.com/${fecha}`], ...(cruce === "auto" || cruce === "manual" ? { cruzadoPor: cruce === "manual" ? "manual" : "documento" } : {}) });

beforeEach(() => {
  mem.participantes.length = mem.respuestas.length = mem.comentarios.length = 0;
  const tres = p("Tres Envíos Panamá", "Ciudad de Panamá");
  envio(tres, "auto", "20/10/2026 9:00:00"); envio(tres, "manual", "22/10/2026 9:00:00"); envio(tres, "auto", "21/10/2026 9:00:00");
  const dosViejo = p("Dos Envíos Viejo Bogotá", "Bogotá D.C.");
  envio(dosViejo, "auto", "10/10/2026 9:00:00"); envio(dosViejo, "auto", "12/10/2026 9:00:00");
  const dosNuevo = p("Dos Envíos Nuevo Panamá", "Ciudad de Panamá");
  envio(dosNuevo, "auto", "24/10/2026 9:00:00"); envio(dosNuevo, "manual", "26/10/2026 9:00:00");
  // Uno asignado + descartada, sin dueño y conflicto que apuntan a la misma persona: NO es duplicado
  const uno = p("Uno Válido Panamá", "Ciudad de Panamá");
  envio(uno, "auto", "25/10/2026 9:00:00"); envio(uno, "descartada", "25/10/2026 10:00:00"); envio(uno, "sin_duenio", "25/10/2026 11:00:00"); envio(uno, "conflicto", "25/10/2026 12:00:00");
  p("Sin Envíos Panamá", "Ciudad de Panamá");
});

describe("búsqueda: duplicados", () => {
  it("reconoce duplicados/duplicado sin importar mayúsculas, tildes ni espacios", () => {
    for (const q of ["duplicados", "Duplicado", "  DUPLICADOS ", "dúplicados"]) expect(esBusquedaDuplicados(q), q).toBe(true);
    for (const q of ["duplica", "duplicados ana", ""]) expect(esBusquedaDuplicados(q), q).toBe(false);
  });
  it("coordinación: solo quienes tienen 2+ envíos asignados, de más envíos a menos y, a igual número, el más reciente primero", async () => {
    await como("coordinador");
    const r = buscarTestimonios(await filas(), "Duplicados").sort(compararDuplicados);
    expect(nombres(r)).toEqual(["Tres Envíos Panamá", "Dos Envíos Nuevo Panamá", "Dos Envíos Viejo Bogotá"]);
    expect(r.map((f) => f.envios.length)).toEqual([3, 2, 2]);
    // Detalle: todos los videos con su fecha, del más reciente al más antiguo
    expect(r[0].envios.map((e) => e.marcaTemporal)).toEqual(["22/10/2026 9:00:00", "21/10/2026 9:00:00", "20/10/2026 9:00:00"]);
  });
  it("descartadas, sin dueño y conflictos no cuentan como envío", async () => {
    await como("coordinador");
    const uno = (await filas()).find((f) => f.nombre === "Uno Válido Panamá")!;
    expect(uno.envios).toHaveLength(1);
    expect(nombres(buscarTestimonios([uno], "duplicados"))).toEqual([]);
  });
  it("cada monitor solo ve los duplicados de su ciudad; y funciona con el filtro de ciudad", async () => {
    await como("monitor", ["Ciudad de Panamá"]);
    expect(nombres(buscarTestimonios(await filas(), "duplicado").sort(compararDuplicados))).toEqual(["Tres Envíos Panamá", "Dos Envíos Nuevo Panamá"]);
    await como("monitor", ["Bogotá D.C."]);
    expect(nombres(buscarTestimonios(await filas(), "duplicados"))).toEqual(["Dos Envíos Viejo Bogotá"]);
    await como("coordinador");
    const soloBogota = (await filas()).filter((f) => f.ciudad === "Bogotá D.C.");
    expect(nombres(buscarTestimonios(soloBogota, "duplicados"))).toEqual(["Dos Envíos Viejo Bogotá"]);
  });
  it("la búsqueda normal sigue igual (nombre, documento, correo o celular)", async () => {
    await como("coordinador");
    expect(nombres(buscarTestimonios(await filas(), "sin envios"))).toEqual(["Sin Envíos Panamá"]);
    expect(buscarTestimonios(await filas(), "")).toHaveLength(5);
  });
});
