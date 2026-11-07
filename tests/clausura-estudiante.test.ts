import type { Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { baseEnMemoria, estudiante, evento, type Base } from "./clausura-datos";

// Portal del estudiante contra una base EN MEMORIA (mongodb-memory-server). Solo se simulan la cookie y getDb.
const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  process.env.RATE_LIMIT_MAX = "3";
  return { db: null as Db | null, cookies: new Map<string, string>() };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (estado.cookies.has(n) ? { value: estado.cookies.get(n)! } : undefined) }),
}));
vi.mock("@/lib/db", () => ({
  getDb: async () => estado.db!,
  collections: async () => ({ rateLimits: estado.db!.collection("rateLimits") }),
}));

import { COOKIE_CLAUSURA } from "@/lib/clausura/sesion";
import * as Contacto from "@/app/api/clausura/estudiante/contacto/route";
import * as Edicion from "@/app/api/clausura/estudiante/edicion/route";
import * as Enviar from "@/app/api/clausura/estudiante/enviar/route";
import * as Estado from "@/app/api/clausura/estudiante/estado/route";
import * as Ingresar from "@/app/api/clausura/estudiante/ingresar/route";
import * as Seccion from "@/app/api/clausura/estudiante/seccion/route";

let base: Base;
const ANA = estudiante("1001", "Cali", { correo: "juanita@gmail.com", nombre: "Juanita Pérez" });
const LUIS = estudiante("2002", "Cartagena", { nombre: "Luis Gómez", estado: "corregido", nombrePropuesto: "Luis Gómez Díaz", correoPropuesto: "luisgomez@hotmail.com" });
const SARA = estudiante("3003", "Bogotá D.C.", { nombre: "Sara Ríos", estado: "pendiente" });
const CALI = evento("cali-2026", ["Cali"]);
const CARTAGENA = evento("cartagena-2026", ["Cartagena"]);
const BOGOTA = evento("bogota-2026", ["Bogotá D.C."], "borrador");

type Res = { status: number; json: Record<string, any>; texto: string };
let ip = "10.0.0.1";
async function llamar(ruta: { [k: string]: any }, metodo: "GET" | "POST" | "PUT", cuerpo?: unknown): Promise<Res> {
  const req = new Request("http://localhost/api/clausura/estudiante/x", {
    method: metodo, headers: { "content-type": "application/json", "x-real-ip": ip }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const res = (await ruta[metodo](req)) as Response & { cookies?: { get: (n: string) => { value: string } | undefined } };
  const c = res.cookies?.get(COOKIE_CLAUSURA)?.value;
  if (c !== undefined) { if (c) estado.cookies.set(COOKIE_CLAUSURA, c); else estado.cookies.delete(COOKIE_CLAUSURA); }
  const texto = await res.text();
  return { status: res.status, json: texto ? JSON.parse(texto) : {}, texto };
}
const ingresar = (documento: string) => llamar(Ingresar, "POST", { documento });

beforeAll(async () => {
  base = await baseEnMemoria();
  estado.db = base.db;
  await base.db.collection("students").insertMany([ANA, LUIS, SARA]);
  await base.db.collection("testimonios_participantes").insertOne({ documento: "1001", nombre: "Juanita Pérez", celular: "3001112233", ciudad: "Cali" });
  await base.db.collection("clausura_eventos").insertMany([CALI, CARTAGENA, BOGOTA]);
});
afterAll(async () => base?.cerrar());
beforeEach(async () => {
  estado.cookies.clear();
  ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
});

describe("ingreso con documento", () => {
  it("lleva al evento de SU ciudad y saluda con su nombre", async () => {
    const r = await ingresar("1.001");
    expect(r.status).toBe(200);
    expect(r.json.evento.slug).toBe("cali-2026");
    expect(r.json.estudiante.nombre).toBe("Juanita Pérez");
    expect(estado.cookies.get(COOKIE_CLAUSURA)).toBeTruthy();
  });
  it("si está corregido, usa el nombre y el correo propuestos; su evento es el de Cartagena", async () => {
    const r = await ingresar("2002");
    expect(r.json.evento.slug).toBe("cartagena-2026");
    expect(r.json.estudiante.nombre).toBe("Luis Gómez Díaz");
    expect(r.json.estudiante.correoOculto).toBe("lu•••••@hotmail.com");
  });
  it("ciudad sin evento abierto (solo borrador): 'Pronto publicaremos…', sin cookie", async () => {
    const r = await ingresar("3003");
    expect(r.json).toEqual({ resultado: "pronto" });
    expect(estado.cookies.has(COOKIE_CLAUSURA)).toBe(false);
  });
  it("documento inexistente: 404, y al llegar al límite de intentos fallidos: 429", async () => {
    expect((await ingresar("999")).status).toBe(404);
    expect((await ingresar("998")).status).toBe(404);
    expect((await ingresar("997")).status).toBe(404);
    expect((await ingresar("1001")).status).toBe(429); // bloqueado aunque el documento exista
  });
  it("sin cookie (o con una inventada) no se puede retomar ni guardar: 401", async () => {
    expect((await llamar(Estado, "GET")).json).toEqual({ resultado: "sin_sesion" });
    estado.cookies.set(COOKIE_CLAUSURA, "abc.def");
    expect((await llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "si" } })).status).toBe(401);
  });
});

describe("contacto, autoguardado, envío y edición", () => {
  it("el flujo completo guarda lo correcto y nunca devuelve el correo ni el celular completos", async () => {
    const textos: string[] = [];
    const paso = async (r: Promise<Res>) => { const x = await r; textos.push(x.texto); return x; };

    const ini = await paso(ingresar("1001"));
    expect(ini.json.estudiante.correoOculto).toBe("ju•••••@gmail.com");
    expect(ini.json.estudiante.celularOculto).toBe("300 ••• •• 33");
    expect(ini.json.respuesta.estado).toBe("nueva");

    // Contacto: confirma el correo, usa el celular prellenado y su WhatsApp es otro número.
    let r = await paso(llamar(Contacto, "PUT", { correoConfirmado: true, celular: { usar: "prellenado" }, whatsapp: "otro", whatsappNumero: "315 444 5566", genero: "femenino" }));
    expect(r.status).toBe(200);
    expect(r.json.siguiente).toBe("s_asis");
    expect(r.json.respuesta.contacto.whatsappOculto).toBe("315 ••• •• 66");

    // Elige "sí", acompañantes con número: luego cambia a "no" → lo de detalles se descarta.
    r = await paso(llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "si" } }));
    expect(r.json.siguiente).toBe("s_det");
    r = await paso(llamar(Seccion, "PUT", { seccion: "s_det", respuestas: { q_acomp: "si", q_cuantos: 2 } }));
    expect(r.json.siguiente).toBe("resumen");
    r = await paso(llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "no" } }));
    expect(r.json.siguiente).toBe("s_motivo");
    expect(r.json.respuesta.respuestas).toEqual({ q_asiste: "no" });

    // Enviar sin el motivo obligatorio: 400 y le dice en qué sección está el error.
    r = await paso(llamar(Enviar, "POST"));
    expect(r.status).toBe(400);
    expect(r.json.seccion).toBe("s_motivo");
    await paso(llamar(Seccion, "PUT", { seccion: "s_motivo", respuestas: { q_motivo: "Tengo un viaje" } }));
    r = await paso(llamar(Enviar, "POST"));
    expect(r.status).toBe(200);
    expect(r.json.respuesta.estado).toBe("enviada");

    // Retoma con la cookie
    r = await paso(llamar(Estado, "GET"));
    expect(r.json.respuesta.estado).toBe("enviada");

    // En la base: datos completos (internos) y respuestas limpias. Nada en students.
    const doc = await base.db.collection("clausura_respuestas").findOne({ documento: "1001" });
    expect(doc?.contacto).toMatchObject({ correoMostrado: "juanita@gmail.com", correoConfirmado: true, celular: "3001112233", celularOrigen: "prellenado", whatsapp: "3154445566" });
    expect(doc?.respuestas).toEqual({ q_asiste: "no", q_motivo: "Tengo un viaje" });
    expect(doc?.formularioVersion).toBe(1);
    expect(await base.db.collection("students").findOne({ documento: "1001" })).toMatchObject({ correo: "juanita@gmail.com" });

    for (const t of textos) {
      expect(t).not.toContain("juanita@gmail.com");
      expect(t).not.toContain("3001112233");
      expect(t).not.toContain("3154445566");
    }

    // Editar: lo enviado no cambia hasta reenviar.
    r = await llamar(Edicion, "POST", { accion: "empezar" });
    expect(r.json.respuesta.editando).toBe(true);
    await llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "si" } });
    expect((await base.db.collection("clausura_respuestas").findOne({ documento: "1001" }))?.respuestas.q_asiste).toBe("no");
    expect((await llamar(Enviar, "POST")).status).toBe(400); // falta "detalles"
    await llamar(Seccion, "PUT", { seccion: "s_det", respuestas: { q_acomp: "no" } });
    r = await llamar(Enviar, "POST");
    expect(r.status).toBe(200);
    const editado = await base.db.collection("clausura_respuestas").findOne({ documento: "1001" });
    expect(editado).toMatchObject({ estado: "enviada", respuestas: { q_asiste: "si", q_acomp: "no" }, ediciones: 1, borradorEdicion: null });
    expect(editado?.editadaEn).toBeInstanceOf(Date);
  });

  it("correo nuevo: se valida y se guarda solo en clausura_respuestas, oculto para el estudiante", async () => {
    await ingresar("2002");
    let r = await llamar(Contacto, "PUT", { correoConfirmado: false, correoNuevo: "luis@sena.edu.co", celular: { nuevo: "300 222 3344" }, whatsapp: "mismo", genero: "masculino" });
    expect(r.status).toBe(400);
    expect(r.json.errores.correoNuevo).toBeTruthy();
    r = await llamar(Contacto, "PUT", { correoConfirmado: false, correoNuevo: "luis.nuevo@gmail.com", celular: { nuevo: "300 222 3344" }, whatsapp: "mismo", genero: "masculino" });
    expect(r.status).toBe(200);
    expect(r.texto).not.toContain("luis.nuevo@gmail.com");
    expect(r.json.respuesta.contacto.correoNuevoOculto).toBe("lu•••••@gmail.com");
    expect(await base.db.collection("students").findOne({ documento: "2002" })).not.toHaveProperty("correoNuevo");
  });

  it("evento cerrado: puede entrar a ver, pero no guardar", async () => {
    await base.db.collection("clausura_eventos").updateOne({ slug: "cartagena-2026" }, { $set: { estado: "cerrado" } });
    const r = await ingresar("2002");
    expect(r.json.puedeResponder).toBe(false);
    expect((await llamar(Contacto, "PUT", { correoConfirmado: true, celular: { nuevo: "3002223344" }, whatsapp: "mismo", genero: "masculino" })).status).toBe(409);
    await base.db.collection("clausura_eventos").updateOne({ slug: "cartagena-2026" }, { $set: { estado: "abierto" } });
  });

  it("no se guarda una sección sin haber pasado por el contacto", async () => {
    await base.db.collection("clausura_respuestas").deleteMany({ documento: "2002" });
    await ingresar("2002");
    expect((await llamar(Seccion, "PUT", { seccion: "s_asis", respuestas: { q_asiste: "si" } })).status).toBe(409);
  });
});
