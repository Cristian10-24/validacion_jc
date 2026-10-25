import { ObjectId } from "mongodb";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { puede, ROLES, type Permiso } from "@/lib/permisos";

// Se prueba el camino real de autorización (cookie firmada → getCurrentUser → exigir) contra los route handlers.
// Solo se simulan la cookie (next/headers) y la base: si un permiso fallara, la ruta intentaría usar
// students/users de verdad y la prueba no devolvería 403.

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }),
}));

const prohibido = () => { throw new Error("La ruta llegó a la base sin permiso"); };
vi.mock("@/lib/db", () => ({
  collections: async () => ({
    users: { findOne: async () => estado.usuario, find: prohibido, insertOne: prohibido, updateOne: prohibido, findOneAndUpdate: prohibido },
    students: new Proxy({}, { get: () => prohibido }),
    changeLog: new Proxy({}, { get: () => prohibido }),
    rateLimits: new Proxy({}, { get: () => prohibido }),
  }),
}));

async function como(rol: "monitor" | "coordinador" | "admin") {
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: `prueba-${rol}`, nombre: "Usuario Prueba", rol, ciudades: rol === "monitor" ? ["Cali"] : [], activo: true, tokenVersion: 0 };
  estado.token = createToken(_id.toHexString(), 0);
}

const ID = new ObjectId().toHexString();
const ctx = { params: Promise.resolve({ id: ID }) };
const json = (method: string, body: unknown) => new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

function subirLista() {
  const fd = new FormData();
  fd.append("archivo", new Blob(["ID,Nombre,Email,Ciudad\n1,Ana Ruiz,a@gmail.com,Cali\n"]), "lista.csv");
  fd.append("modo", "vista");
  return new Request("http://localhost/api/admin/importar", { method: "POST", body: fd });
}

// Rutas que el coordinador NO puede usar.
const soloAdmin: [string, () => Promise<Response>][] = [
  ["subir la lista (vista previa)", async () => (await import("@/app/api/admin/importar/route")).POST(subirLista())],
  ["ver usuarios", async () => (await import("@/app/api/admin/usuarios/route")).GET()],
  ["crear usuario", async () => (await import("@/app/api/admin/usuarios/route")).POST(json("POST", { usuario: "nuevo", nombre: "Nuevo Usuario", rol: "monitor", ciudades: ["Cali"] }))],
  ["editar usuario", async () => (await import("@/app/api/admin/usuarios/[id]/route")).PATCH(json("PATCH", { rol: "admin" }), ctx)],
  ["restablecer clave", async () => (await import("@/app/api/admin/usuarios/[id]/clave/route")).POST(json("POST", {}), ctx)],
  ["exportar pendientes", async () => (await import("@/app/api/admin/exportar-pendientes/route")).GET(new Request("http://localhost/api/admin/exportar-pendientes"))],
  ["editar el documento de un estudiante", async () => (await import("@/app/api/admin/estudiantes/[id]/route")).PATCH(json("PATCH", { documento: "999", nombre: "Ana Ruiz", correo: "a@gmail.com", ciudad: "Cali", grupo: "", estado: "validado" }), ctx)],
];

// Rutas de coordinación que el monitor NO puede usar.
const coordinacion: [string, () => Promise<Response>][] = [
  ["ver el resumen", async () => (await import("@/app/api/admin/resumen/route")).GET()],
  ["descargar el Excel final", async () => (await import("@/app/api/admin/exportar/route")).GET()],
  ["ver el historial", async () => (await import("@/app/api/monitor/estudiantes/[id]/route")).GET(new Request("http://localhost/x"), ctx)],
];

describe("matriz de permisos", () => {
  const tabla: Record<Permiso, [boolean, boolean, boolean]> = {
    // [monitor, coordinador, admin]
    ver_todas_las_ciudades: [false, true, true],
    ver_resumen: [false, true, true],
    descargar_excel: [false, true, true],
    ver_historial: [false, true, true],
    subir_lista: [false, false, true],
    gestionar_usuarios: [false, false, true],
    editar_todo: [false, false, true],
    exportar_pendientes: [false, false, true],
  };
  for (const [permiso, esperado] of Object.entries(tabla))
    it(permiso, () => expect(ROLES.map((r) => puede(r, permiso as Permiso))).toEqual(esperado));
  it("un rol desconocido no tiene permisos", () => expect(puede("intruso", "ver_resumen")).toBe(false));
});

describe("el coordinador recibe 403", () => {
  beforeAll(() => como("coordinador"));
  for (const [nombre, llamar] of soloAdmin) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
});

describe("el monitor recibe 403", () => {
  beforeAll(() => como("monitor"));
  for (const [nombre, llamar] of [...soloAdmin, ...coordinacion]) it(`al ${nombre}`, async () => expect((await llamar()).status).toBe(403));
});

describe("sin sesión", () => {
  beforeAll(() => { estado.token = ""; estado.usuario = null; });
  for (const [nombre, llamar] of [...soloAdmin, ...coordinacion]) it(`401 al ${nombre}`, async () => expect((await llamar()).status).toBe(401));
});

describe("sesión con clave restablecida", () => {
  it("una cookie con versión vieja ya no sirve", async () => {
    await como("admin");
    estado.usuario = { ...estado.usuario!, tokenVersion: 1 }; // se restableció la clave después de emitir la cookie
    const { getCurrentUser } = await import("@/lib/auth");
    expect(await getCurrentUser()).toBeNull();
  });
});
