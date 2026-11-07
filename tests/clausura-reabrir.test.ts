import { ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { baseEnMemoria, estudiante, evento, type Base } from "./clausura-datos";

// Después de enviar NO se edita (por defecto). Solo el admin reabre una respuesta; queda en la auditoría.
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { db: null as Db | null, cookies: new Map<string, string>() };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (estado.cookies.has(n) ? { value: estado.cookies.get(n)! } : undefined) }) }));
vi.mock("@/lib/db", () => ({
  getDb: async () => estado.db!,
  collections: async () => ({ users: estado.db!.collection("users"), rateLimits: estado.db!.collection("rateLimits") }),
}));

import { createToken } from "@/lib/auth";
import { COOKIE_CLAUSURA } from "@/lib/clausura/sesion";
import * as Edicion from "@/app/api/clausura/estudiante/edicion/route";
import * as Enviar from "@/app/api/clausura/estudiante/enviar/route";
import * as Ingresar from "@/app/api/clausura/estudiante/ingresar/route";
import * as Contacto from "@/app/api/clausura/estudiante/contacto/route";
import * as Seccion from "@/app/api/clausura/estudiante/seccion/route";
import * as Reabrir from "@/app/api/clausura/panel/[studentId]/reabrir/route";
import * as Calendario from "@/app/api/clausura/calendario/[slug]/route";

let base: Base;
const ANA = estudiante("5001", "Cali", { nombre: "Ana Pérez" });
const CALI = evento("cali-2026", ["Cali"], "abierto", { permitirEdicion: false, opcionesAsisten: ["si"] });
const U = {
  monitor: { _id: new ObjectId(), usuario: "m-cali", nombre: "Monitora", rol: "monitor", ciudades: ["Cali"], activo: true, tokenVersion: 0 },
  coord: { _id: new ObjectId(), usuario: "coord", nombre: "Coordinación", rol: "coordinador", ciudades: [], activo: true, tokenVersion: 0 },
  admin: { _id: new ObjectId(), usuario: "admin", nombre: "Admin", rol: "admin", ciudades: [], activo: true, tokenVersion: 0 },
};

async function llamar(ruta: { [k: string]: any }, metodo: "POST" | "PUT", cuerpo?: unknown) {
  const req = new Request("http://localhost/api/clausura/estudiante/x", { method: metodo, headers: { "content-type": "application/json", "x-real-ip": "10.9.9.9" }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
  const res = await ruta[metodo](req);
  const c = res.cookies?.get(COOKIE_CLAUSURA)?.value;
  if (c) estado.cookies.set(COOKIE_CLAUSURA, c);
  return { status: res.status as number, json: await res.json() };
}
const reabrirComo = async (u: { _id: ObjectId }) => {
  estado.cookies.set("vjc_session", createToken(u._id.toHexString(), 0));
  const res = await Reabrir.POST(new Request(`http://localhost/api/clausura/panel/${ANA._id}/reabrir?evento=${CALI._id}`, { method: "POST" }), { params: Promise.resolve({ studentId: ANA._id.toHexString() }) });
  estado.cookies.delete("vjc_session");
  return res.status;
};
const doc = () => base.db.collection("clausura_respuestas").findOne({ documento: "5001" });

beforeAll(async () => {
  base = await baseEnMemoria();
  estado.db = base.db;
  await base.db.collection("students").insertOne(ANA);
  await base.db.collection("users").insertMany(Object.values(U));
  await base.db.collection("clausura_eventos").insertOne(CALI);
});
afterAll(async () => base?.cerrar());

describe("sin edición después de enviar, salvo que el admin reabra", () => {
  it("flujo completo", async () => {
    await llamar(Ingresar, "POST", { documento: "5001" });
    await llamar(Contacto, "PUT", { correoConfirmado: true, celular: { nuevo: "3005556677" }, whatsapp: "mismo", genero: "femenino" });
    await llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "si" } });
    await llamar(Seccion, "PUT", { seccion: "s_det", respuestas: { q_acomp: "no" } });
    let r = await llamar(Enviar, "POST");
    expect(r.status).toBe(200);
    expect(r.json.puedeResponder).toBe(false);
    expect(r.json.asistira).toBe(true); // ofrece el calendario

    // Ya no puede guardar, editar ni reenviar.
    expect((await llamar(Edicion, "POST", { accion: "empezar" })).status).toBe(409);
    expect((await llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "no" } })).status).toBe(409);
    expect((await llamar(Contacto, "PUT", { correoConfirmado: true, celular: { nuevo: "3005556677" }, whatsapp: "no", genero: "femenino" })).status).toBe(409);
    expect((await llamar(Enviar, "POST")).status).toBe(409);
    expect((await doc())?.respuestas).toEqual({ q_asiste: "si", q_acomp: "no" });

    // Monitor y coordinación no pueden reabrir.
    expect(await reabrirComo(U.monitor)).toBe(403);
    expect(await reabrirComo(U.coord)).toBe(403);
    expect((await doc())?.reabierta ?? null).toBeNull();

    // El admin sí, y queda en la auditoría.
    expect(await reabrirComo(U.admin)).toBe(200);
    expect((await doc())?.reabierta).toMatchObject({ por: "admin" });
    expect(await base.db.collection("clausura_auditoria").findOne({ accion: "reabrir" })).toMatchObject({ por: "admin", detalle: { documento: "5001" } });

    // El estudiante edita y vuelve a enviar.
    r = await llamar(Edicion, "POST", { accion: "empezar" });
    expect(r.status).toBe(200);
    expect(r.json.respuesta.reabierta).toBe(true);
    await llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "no" } });
    await llamar(Seccion, "PUT", { seccion: "s_motivo", respuestas: { q_motivo: "Viajo con mi familia" } });
    r = await llamar(Enviar, "POST");
    expect(r.status).toBe(200);
    expect(r.json.asistira).toBe(false);
    expect(await doc()).toMatchObject({ respuestas: { q_asiste: "no", q_motivo: "Viajo con mi familia" }, reabierta: null, ediciones: 1 });

    // Al reenviar se cierra otra vez.
    expect((await llamar(Edicion, "POST", { accion: "empezar" })).status).toBe(409);
  });

  it("reabrir una respuesta que no se ha enviado: 409", async () => {
    await base.db.collection("clausura_respuestas").updateOne({ documento: "5001" }, { $set: { estado: "en_progreso" } });
    expect(await reabrirComo(U.admin)).toBe(409);
  });

  it("el .ics se descarga como text/calendar (y los borradores no existen)", async () => {
    const res = await Calendario.GET(new Request("http://localhost/x"), { params: Promise.resolve({ slug: "cali-2026" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    expect(res.headers.get("content-disposition")).toContain("cali-2026.ics");
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR\r\n/);
    const no = await Calendario.GET(new Request("http://localhost/x"), { params: Promise.resolve({ slug: "no-existe" }) });
    expect(no.status).toBe(404);
  });
});
