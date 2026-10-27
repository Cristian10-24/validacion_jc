import { ObjectId } from "mongodb";
import { beforeAll, describe, expect, it, vi } from "vitest";

// Camino real de autorización (cookie firmada → getCurrentUser → exigir) contra las rutas del módulo.
// Solo se simulan la cookie y la lectura del usuario. Si una ruta pasara sin permiso, intentaría usar
// las colecciones de testimonios y la prueba fallaría (no devolvería 403).

const estado = vi.hoisted(() => {
  process.env.SESSION_SECRET = "secreto-de-pruebas-0123456789";
  return { token: "", usuario: null as Record<string, unknown> | null };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (estado.token ? { value: estado.token } : undefined) }) }));
const prohibido = () => { throw new Error("La ruta llegó a la base sin permiso"); };
vi.mock("@/lib/db", () => ({
  collections: async () => ({ users: { findOne: async () => estado.usuario } }),
  getDb: prohibido,
}));
vi.mock("@/lib/testimonios/db", () => ({ testimonios: prohibido, COLECCIONES: {} }));

async function como(rol: "monitor" | "coordinador" | "admin" | null) {
  if (!rol) { estado.token = ""; estado.usuario = null; return; }
  const { createToken } = await import("@/lib/auth");
  const _id = new ObjectId();
  estado.usuario = { _id, usuario: `prueba-${rol}`, nombre: "Prueba", rol, ciudades: rol === "monitor" ? ["Cali"] : [], activo: true, tokenVersion: 0 };
  estado.token = createToken(_id.toHexString(), 0);
}

function subirLista() {
  const fd = new FormData();
  fd.append("archivo", new Blob(["Nombres,Apellidos,Celular,Correo,Documento,Ciudad\nAna,Ruiz,3001112233,a@gmail.com,1,Cali\n"]), "lista.csv");
  fd.append("modo", "vista");
  return new Request("http://localhost/api/admin/testimonios/lista", { method: "POST", body: fd });
}

const accion = async (body: unknown) => (await import("@/app/api/admin/testimonios/respuestas/[id]/route")).POST(
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: new ObjectId().toHexString() }) },
);

const soloAdmin: [string, () => Promise<Response>][] = [
  ["subir la lista de testimonios", async () => (await import("@/app/api/admin/testimonios/lista/route")).POST(subirLista())],
  ["ver Sin dueño", async () => (await import("@/app/api/admin/testimonios/sin-duenio/route")).GET()],
  ["asignar una respuesta", async () => accion({ accion: "asignar", participanteId: new ObjectId().toHexString() })],
  ["descartar una respuesta", async () => accion({ accion: "descartar", motivo: "prueba" })],
];

describe("testimonios: acciones solo de admin (lista, Sin dueño, asignar, descartar)", () => {
  it("el coordinador recibe 403", async () => { await como("coordinador"); for (const [, f] of soloAdmin) expect((await f()).status).toBe(403); });
  it("el monitor recibe 403", async () => { await como("monitor"); for (const [, f] of soloAdmin) expect((await f()).status).toBe(403); });
  it("sin sesión recibe 401", async () => { await como(null); for (const [, f] of soloAdmin) expect((await f()).status).toBe(401); });
  it("el admin sí pasa la autorización (llega a la base: aquí simulada como prohibida)", async () => {
    await como("admin");
    for (const [, f] of soloAdmin) await expect(f()).rejects.toThrow("La ruta llegó a la base sin permiso");
  });
});

describe("matriz de permisos de testimonios", () => {
  beforeAll(() => undefined);
  it("todos ven, comentan y exportan pendientes; resumen para coordinación y admin; solo admin sube lista y ve sin dueño", async () => {
    const { puede } = await import("@/lib/permisos");
    const t = (rol: string) => ["testimonios_ver", "testimonios_comentar", "testimonios_subir_lista", "testimonios_sin_duenio", "testimonios_exportar_pendientes", "testimonios_resumen"].map((p) => puede(rol, p as never));
    expect(t("monitor")).toEqual([true, true, false, false, true, false]);
    expect(t("coordinador")).toEqual([true, true, false, false, true, true]);
    expect(t("admin")).toEqual([true, true, true, true, true, true]);
  });
});
