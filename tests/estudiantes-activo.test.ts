import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { baseEnMemoria, estudiante, evento, type Base } from "./clausura-datos";

// Fase 8: estado activo/inactivo de ESTUDIANTES (students + testimonios_participantes, un solo interruptor).
// - Sin el campo `activo` todo queda igual que antes (mismos conteos que sin filtro).
// - Con un inactivo, cada total baja en 1 y la persona reaparece con "Mostrar inactivos" / ?inactivos=1.
// - Solo el admin inactiva y reactiva; coordinación y monitor reciben 403.
// - Un inactivo que entra con su documento (validación o clausura) ve "Escríbele a tu monitor".
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { db: null as Db | null, cookies: new Map<string, string>() };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (estado.cookies.has(n) ? { value: estado.cookies.get(n)! } : undefined) }) }));
vi.mock("@/lib/db", () => ({
  getDb: async () => estado.db!,
  collections: async () => ({
    students: estado.db!.collection("students"), users: estado.db!.collection("users"),
    changeLog: estado.db!.collection("changeLog"), rateLimits: estado.db!.collection("rateLimits"),
  }),
}));

import { soloActivos, visiblesSegunFiltro } from "@/lib/activo";
import { createToken } from "@/lib/auth";
import { datosCertificados, filasPendientes } from "@/lib/export";
import { resumenValidacion } from "@/lib/resumen-validacion";
import { monitorRow } from "@/lib/monitor-view";
import { contarPorCiudad } from "@/lib/testimonios/resumen";
import { pendientesParaExportar } from "@/lib/testimonios/exportar";
import { filasTestimonios } from "@/lib/testimonios/vista";
import { contarEncuestaPorCiudad } from "@/lib/encuesta/resumen";
import { filasEncuesta } from "@/lib/encuesta/vista";
import { resumenClausura } from "@/lib/clausura/resumen";
import { datosPanel } from "@/lib/clausura/panel";
import { excelClausura } from "@/lib/clausura/exportar";
import * as Activo from "@/app/api/admin/estudiantes/activo/route";
import * as Buscar from "@/app/api/estudiante/buscar/route";
import * as Guardar from "@/app/api/estudiante/guardar/route";
import * as Ingresar from "@/app/api/clausura/estudiante/ingresar/route";
import * as Lista from "@/app/api/admin/testimonios/lista/route";
import type { Student } from "@/lib/types";

let base: Base;
const ADMIN = { rol: "admin" as const, ciudades: [] as string[] };
const U = {
  monitor: { _id: new ObjectId(), usuario: "m-cali", nombre: "Monitora Cali", rol: "monitor", ciudades: ["Cali"], activo: true, tokenVersion: 0 },
  coord: { _id: new ObjectId(), usuario: "coord", nombre: "Coordinación", rol: "coordinador", ciudades: [], activo: true, tokenVersion: 0 },
  admin: { _id: new ObjectId(), usuario: "admin", nombre: "Admin Prueba", rol: "admin", ciudades: [], activo: true, tokenVersion: 0 },
};
// 1002 está en students y en participantes (con el documento escrito con puntos en la lista de testimonios ya normalizado).
const ESTUDIANTES = [
  estudiante("1001", "Cali", { nombre: "Ana Ruiz", estado: "validado" }),
  estudiante("1002", "Cali", { nombre: "Beto Gómez", estado: "pendiente" }),
  estudiante("1003", "Cali", { nombre: "Carla Díaz", estado: "corregido", nombrePropuesto: "Carla Díaz Pérez" }),
  estudiante("2001", "Cartagena", { nombre: "Dani Mora", estado: "pendiente" }),
  estudiante("2002", "Cartagena", { nombre: "Eva Luna", estado: "validado", activo: true }), // activo explícito = igual que sin campo
];
const participante = (documento: string, ciudad: string, nombre: string) => {
  const ahora = new Date();
  return { _id: new ObjectId(), documento, nombres: nombre.split(" ")[0], apellidos: nombre.split(" ")[1], nombre, celular: "3001234567", celularClave: "3001234567", correo: `${documento}@gmail.com`, ciudad, creadoEn: ahora, actualizadoEn: ahora };
};
const PARTICIPANTES = [participante("1001", "Cali", "Ana Ruiz"), participante("1002", "Cali", "Beto Gómez"), participante("2001", "Cartagena", "Dani Mora"), participante("3001", "Cali", "Fede Paz")];
const CALI = evento("cali-2026", ["Cali"], "abierto");
const CTG = evento("cartagena-2026", ["Cartagena"], "abierto");

const students = () => base.db.collection<Student>("students");
const sesion = (u: { _id: ObjectId } | null) => {
  if (u) estado.cookies.set("vjc_session", createToken(u._id.toHexString(), 0));
  else estado.cookies.delete("vjc_session");
};
async function cambiar(u: { _id: ObjectId } | null, cuerpo: unknown) {
  sesion(u);
  const res = await Activo.POST(new Request("http://localhost/api/admin/estudiantes/activo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) }));
  sesion(null);
  return { status: res.status, json: await res.json() };
}
const post = async (ruta: { POST: (r: Request) => Promise<Response> }, cuerpo: unknown) => {
  const res = await ruta.POST(new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json", "x-real-ip": "10.7.7.7" }, body: JSON.stringify(cuerpo) }));
  return { status: res.status, json: await res.json() };
};

/** Todos los conteos que ven las vistas y las exportaciones. */
async function conteos() {
  const val = await resumenValidacion(students() as never, base.db.collection("users") as never);
  const cert = await datosCertificados(students() as never);
  const testim = await filasTestimonios(ADMIN);
  const enc = await filasEncuesta(ADMIN);
  const clau = await resumenClausura(ADMIN);
  const excel = await excelClausura(ADMIN, { evento: "todos", sinResponder: true });
  const panel = await datosPanel(ADMIN, CALI._id.toHexString());
  return {
    validacion: val.total.total,
    validacionCali: val.ciudades.find((c) => c.ciudad === "Cali")!.total,
    pendientesValidacion: val.total.pendiente,
    inactivosValidacion: val.total.inactivos,
    certificadosOriginales: cert.originales.length,
    excelPendientes: (await filasPendientes(students() as never)).length,
    testimonios: contarPorCiudad(testim).total.total,
    testimoniosPendientesExcel: pendientesParaExportar(testim).length,
    encuesta: contarEncuestaPorCiudad(enc).total.total,
    clausura: clau.total.total,
    clausuraExcel: excel.filas,
    panelClausuraActivos: soloActivos(panel.filas).length,
    panelEstudiantesActivos: soloActivos((await students().find().toArray()).map((s) => monitorRow(s, new Set()))).length,
  };
}

// Lo que daban las vistas ANTES de esta fase (sin ningún filtro): conteos directos sobre la base.
async function conteosSinFiltro() {
  const st = await students().find().toArray();
  const pa = await base.db.collection("testimonios_participantes").countDocuments();
  return {
    validacion: st.length,
    validacionCali: st.filter((s) => s.ciudad === "Cali").length,
    pendientesValidacion: st.filter((s) => s.estado === "pendiente").length,
    inactivosValidacion: 0,
    certificadosOriginales: st.length,
    excelPendientes: st.filter((s) => s.estado === "pendiente").length,
    testimonios: pa,
    testimoniosPendientesExcel: pa, // nadie ha enviado testimonio
    encuesta: pa,
    clausura: st.length,
    clausuraExcel: st.length,
    panelClausuraActivos: st.filter((s) => s.ciudad === "Cali").length,
    panelEstudiantesActivos: st.length,
  };
}

let antes: Awaited<ReturnType<typeof conteos>>;

beforeAll(async () => {
  base = await baseEnMemoria();
  estado.db = base.db;
  await students().insertMany(ESTUDIANTES as never);
  await base.db.collection("testimonios_participantes").insertMany(PARTICIPANTES);
  await base.db.collection("users").insertMany(Object.values(U));
  await base.db.collection("clausura_eventos").insertMany([CALI, CTG]);
});
afterAll(async () => base?.cerrar());

describe("sin el campo activo: todo queda idéntico a hoy", () => {
  it("ningún estudiante ni participante tiene activo: false", async () => {
    expect(await students().countDocuments({ activo: false })).toBe(0);
    expect(await students().countDocuments({ activo: { $exists: false } })).toBe(4);
  });
  it("cada conteo es igual al de antes (sin filtro)", async () => {
    antes = await conteos();
    expect(antes).toEqual(await conteosSinFiltro());
    expect(antes.validacion).toBe(5);
    expect(antes.testimonios).toBe(4);
  });
});

describe("permisos: solo el admin inactiva y reactiva", () => {
  it("coordinación y monitor reciben 403 al inactivar y al reactivar; no cambia nada", async () => {
    for (const u of [U.coord, U.monitor]) {
      expect((await cambiar(u, { documento: "1002", activo: false, motivo: "Se retiró" })).status).toBe(403);
      expect((await cambiar(u, { documento: "1002", activo: true })).status).toBe(403);
    }
    expect(await students().countDocuments({ activo: { $exists: true }, documento: "1002" })).toBe(0);
    expect(await base.db.collection("changeLog").countDocuments()).toBe(0);
  });
  it("sin sesión: 401", async () => {
    expect((await cambiar(null, { documento: "1002", activo: false, motivo: "x" })).status).toBe(401);
  });
  it("el motivo es obligatorio para inactivar", async () => {
    const r = await cambiar(U.admin, { documento: "1002", activo: false, motivo: "   " });
    expect(r.status).toBe(422);
    expect(await students().countDocuments({ activo: false })).toBe(0);
  });
  it("documento que no existe: 404", async () => {
    expect((await cambiar(U.admin, { documento: "999999", activo: false, motivo: "Prueba" })).status).toBe(404);
  });
});

describe("con un inactivo", () => {
  it("el admin inactiva: se aplica en students y en testimonios_participantes, con registro", async () => {
    const r = await cambiar(U.admin, { documento: "1.002", activo: false, motivo: "Se retiró del programa" });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, activo: false, students: 1, participantes: 1 });
    const s = await students().findOne({ documento: "1002" });
    expect(s).toMatchObject({ activo: false, inactivoMotivo: "Se retiró del programa", inactivoPor: { usuario: "admin", rol: "admin" } });
    expect(s!.inactivoEn).toBeInstanceOf(Date);
    expect(await base.db.collection("testimonios_participantes").findOne({ documento: "1002" })).toMatchObject({ activo: false, inactivoMotivo: "Se retiró del programa" });
    expect(await base.db.collection("changeLog").findOne({ documento: "1002" })).toMatchObject({ campo: "activo", anterior: "activo", nuevo: "inactivo", accion: "inactivar", motivo: "Se retiró del programa", actor: { rol: "admin", usuario: "admin" } });
    expect(await base.db.collection("testimonios_auditoria").findOne({ accion: "inactivar_participante" })).toMatchObject({ por: "admin", detalle: { documento: "1002", motivo: "Se retiró del programa" } });
  });

  it("cada total baja en 1", async () => {
    const ahora = await conteos();
    expect(ahora).toEqual({
      ...antes,
      validacion: antes.validacion - 1, validacionCali: antes.validacionCali - 1, pendientesValidacion: antes.pendientesValidacion - 1, inactivosValidacion: 1,
      certificadosOriginales: antes.certificadosOriginales - 1, excelPendientes: antes.excelPendientes - 1,
      testimonios: antes.testimonios - 1, testimoniosPendientesExcel: antes.testimoniosPendientesExcel - 1, encuesta: antes.encuesta - 1,
      clausura: antes.clausura - 1, clausuraExcel: antes.clausuraExcel - 1, panelClausuraActivos: antes.panelClausuraActivos - 1, panelEstudiantesActivos: antes.panelEstudiantesActivos - 1,
    });
  });

  it("reaparece con el filtro \"Mostrar inactivos\" y con la opción de incluirlos en las exportaciones", async () => {
    const testim = await filasTestimonios(ADMIN);
    expect(visiblesSegunFiltro(testim, false).some((f) => f.documento === "1002")).toBe(false);
    const visto = visiblesSegunFiltro(testim, true).find((f) => f.documento === "1002");
    expect(visto?.inactivo).toMatchObject({ motivo: "Se retiró del programa", por: "Admin Prueba" });
    expect(visiblesSegunFiltro(await filasEncuesta(ADMIN), true).find((f) => f.documento === "1002")?.inactivo).not.toBeNull();
    const panel = await datosPanel(ADMIN, CALI._id.toHexString());
    expect(visiblesSegunFiltro(panel.filas, true).find((f) => f.documento === "1002")?.inactivo).not.toBeNull();
    expect(visiblesSegunFiltro(panel.filas, false).some((f) => f.documento === "1002")).toBe(false);

    expect((await datosCertificados(students() as never, { incluirInactivos: true })).originales).toHaveLength(antes.certificadosOriginales);
    expect(await filasPendientes(students() as never, undefined, true)).toHaveLength(antes.excelPendientes);
    expect(pendientesParaExportar(testim, undefined, true)).toHaveLength(antes.testimoniosPendientesExcel);
    expect((await excelClausura(ADMIN, { evento: "todos", sinResponder: true, incluirInactivos: true })).filas).toBe(antes.clausuraExcel);
  });

  it("volver a inactivar no pisa el motivo original", async () => {
    const r = await cambiar(U.admin, { documento: "1002", activo: false, motivo: "Otro motivo" });
    expect(r.json).toMatchObject({ students: 0, participantes: 0 });
    expect((await students().findOne({ documento: "1002" }))!.inactivoMotivo).toBe("Se retiró del programa");
  });
});

describe("el inactivo que entra con su documento ve \"Escríbele a tu monitor\"", () => {
  it("validación: no se muestra ningún dato y no puede guardar", async () => {
    const r = await post(Buscar, { documento: "1002" });
    expect(r.status).toBe(409);
    expect(r.json).toEqual({ error: "inactivo" });
    const id = (await students().findOne({ documento: "1002" }))!._id.toHexString();
    const g = await post(Guardar, { id, documento: "1002", accion: "confirmar", aceptaCorreoPersonal: true });
    expect(g.status).toBe(409);
    expect(g.json.error).toBe("inactivo");
    expect((await students().findOne({ documento: "1002" }))!.estado).toBe("pendiente");
  });
  it("clausura: no entra al formulario", async () => {
    const r = await post(Ingresar, { documento: "1002" });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ resultado: "inactivo" });
  });
  it("un activo sigue entrando normal", async () => {
    expect((await post(Buscar, { documento: "1001" })).json.estado).toBe("validado");
  });
});

describe("reactivar", () => {
  it("el admin reactiva: todo vuelve a los conteos de antes y queda registrado", async () => {
    const r = await cambiar(U.admin, { documento: "1002", activo: true });
    expect(r.json).toMatchObject({ ok: true, activo: true, students: 1, participantes: 1 });
    expect(await conteos()).toEqual(antes);
    const s = await students().findOne({ documento: "1002" });
    expect(s).toMatchObject({ activo: true, inactivoMotivo: "Se retiró del programa", reactivadoPor: { usuario: "admin" } });
    expect(await base.db.collection("changeLog").findOne({ documento: "1002", accion: "activar" })).toMatchObject({ anterior: "inactivo", nuevo: "activo" });
    expect(await base.db.collection("testimonios_auditoria").countDocuments({ accion: "reactivar_participante" })).toBe(1);
    expect((await post(Buscar, { documento: "1002" })).status).toBe(200);
  });
  it("solo participante (sin students) también se puede inactivar", async () => {
    const r = await cambiar(U.admin, { documento: "3001", activo: false, motivo: "Duplicado" });
    expect(r.json).toMatchObject({ students: 0, participantes: 1 });
    expect(contarPorCiudad(await filasTestimonios(ADMIN)).total.total).toBe(antes.testimonios - 1);
    await cambiar(U.admin, { documento: "3001", activo: true });
  });
});

describe("lista de testimonios: quien ya está inactivo en students se crea inactivo", () => {
  const CSV = [
    "Nombres,Apellidos,Celular,Correo,Documento,Ciudad",
    "Dani,Mora,3001234567,2001@gmail.com,2001,Cartagena",
    "Eva,Luna,3009876543,2002@gmail.com,2002,Cartagena", // nuevo en testimonios, inactivo en students
    "Gabi,Sol,3005550000,4001@gmail.com,4001,Cali", // nuevo y activo
  ].join("\n");
  async function subir(modo: "vista" | "aplicar") {
    const form = new FormData();
    form.set("archivo", new File([CSV], "lista.csv", { type: "text/csv" }));
    form.set("modo", modo);
    form.set("eliminar", "[]");
    sesion(U.admin);
    const res = await Lista.POST(new Request("http://localhost/api/admin/testimonios/lista", { method: "POST", body: form }));
    sesion(null);
    return { status: res.status, json: await res.json() };
  }

  it("la vista previa avisa cuántos quedarán inactivos y no escribe nada", async () => {
    await cambiar(U.admin, { documento: "2002", activo: false, motivo: "Cambio de ciudad" });
    const total = await base.db.collection("testimonios_participantes").countDocuments();
    const r = await subir("vista");
    expect(r.status).toBe(200);
    expect(r.json.plan.nuevos.map((f: { documento: string }) => f.documento).sort()).toEqual(["2002", "4001"]);
    expect(r.json.plan.quedanInactivos).toEqual([{ documento: "2002", motivo: "Cambio de ciudad" }]);
    expect(await base.db.collection("testimonios_participantes").countDocuments()).toBe(total);
  });

  it("al aplicar, el participante nace inactivo con el mismo motivo, fecha y autor; el otro nuevo queda activo", async () => {
    const r = await subir("aplicar");
    expect(r.json.resultado).toMatchObject({ insertados: 2, inactivos: 1 });
    const st = await students().findOne({ documento: "2002" });
    const pa = await base.db.collection("testimonios_participantes").findOne({ documento: "2002" });
    expect(pa).toMatchObject({ activo: false, inactivoMotivo: "Cambio de ciudad", inactivoEn: st!.inactivoEn, inactivoPor: st!.inactivoPor });
    expect(pa!.inactivoPor).toMatchObject({ usuario: "admin" });
    const nuevo = await base.db.collection("testimonios_participantes").findOne({ documento: "4001" });
    expect(nuevo).not.toHaveProperty("activo");
    expect(await base.db.collection("testimonios_auditoria").findOne({ accion: "inactivar_participante", "detalle.documento": "2002" }))
      .toMatchObject({ por: "admin", detalle: { motivo: "Cambio de ciudad", heredadoDeStudents: true } });
    expect(await base.db.collection("testimonios_auditoria").findOne({ accion: "subir_lista" })).toMatchObject({ detalle: { insertados: 2, inactivosHeredados: 1 } });
    // No cuenta en los totales de testimonios y aparece con la etiqueta.
    const filas = await filasTestimonios(ADMIN);
    expect(filas.find((f) => f.documento === "2002")?.inactivo).toMatchObject({ motivo: "Cambio de ciudad" });
    expect(contarPorCiudad(filas).total.total).toBe(soloActivos(filas).length);
    // Reactivar desde el admin lo reactiva en las dos colecciones.
    expect((await cambiar(U.admin, { documento: "2002", activo: true })).json).toMatchObject({ students: 1, participantes: 1 });
  });
});
