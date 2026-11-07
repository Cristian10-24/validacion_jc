import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { decidir } from "@/lib/clausura/subdominio";
import { proxy } from "@/proxy";

// Subdominio exclusivo para estudiantes: clausura.tocaunavida.org. El dominio actual no cambia.
const SUB = "clausura.tocaunavida.org";
const ACTUAL = "validacion.tocaunavida.org";

const llamar = (host: string, ruta: string, metodo = "GET") =>
  proxy(new NextRequest(`https://${host}${ruta}`, { method: metodo, headers: { host } }));
const sigue = (r: Response) => r.headers.get("x-middleware-next") === "1";
const destino = (r: Response) => (r.status === 307 ? new URL(r.headers.get("location")!).pathname + new URL(r.headers.get("location")!).search : null);

afterEach(() => { delete process.env.CLAUSURA_HOST; });

describe("en el subdominio de estudiantes", () => {
  const permitidas = [
    "/clausura", "/clausura/cali-2026", "/clausura/cartagena-2026", "/clausura/expoferia-2026.jpg",
    "/api/clausura/estudiante/ingresar", "/api/clausura/estudiante/seccion", "/api/clausura/calendario/cali-2026",
    "/api/clausura/imagenes/0123456789abcdef01234567", "/favicon.ico", "/logo-jc.png",
  ];
  it.each(permitidas)("%s funciona", (ruta) => {
    process.env.CLAUSURA_HOST = SUB;
    expect(sigue(llamar(SUB, ruta, ruta.includes("/estudiante/") ? "POST" : "GET"))).toBe(true);
  });

  const bloqueadas = [
    "/", "/login", "/admin", "/admin/usuarios", "/monitor", "/testimonios", "/encuesta", "/cerrado",
    "/clausura/panel", "/clausura/resumen", "/clausura/eventos",
    "/api/auth/login", "/api/admin/exportar", "/api/clausura/panel", "/api/clausura/eventos", "/api/clausura/exportar",
    "/api/clausura/resumen", "/api/estudiante/buscar", "/api/testimonios",
  ];
  it.each(bloqueadas)("%s redirige a /clausura", (ruta) => {
    process.env.CLAUSURA_HOST = SUB;
    const r = llamar(SUB, `${ruta}?x=1`);
    expect(r.status).toBe(307);
    expect(destino(r)).toBe("/clausura");
  });

  it("subir imágenes (POST) no está permitido aunque leerlas sí", () => {
    process.env.CLAUSURA_HOST = SUB;
    expect(llamar(SUB, "/api/clausura/imagenes", "POST").status).toBe(307);
  });
  it("la redirección se queda en el subdominio (no manda al dominio interno)", () => {
    process.env.CLAUSURA_HOST = SUB;
    const r = proxy(new NextRequest("https://interno.vercel.app/admin", { headers: { host: SUB, "x-forwarded-proto": "https" } }));
    expect(r.headers.get("location")).toBe(`https://${SUB}/clausura`);
  });
  it("tolera mayúsculas y puerto en el host", () => {
    expect(decidir("Clausura.TocaUnaVida.org:443", "/login", "GET", SUB)).toEqual({ tipo: "redirigir", a: "/clausura" });
  });
});

describe("en el dominio actual todo sigue igual", () => {
  const rutas = ["/", "/login", "/admin", "/monitor", "/testimonios", "/encuesta", "/clausura/panel", "/clausura/eventos", "/api/auth/login", "/api/clausura/panel"];
  it.each(rutas)("%s pasa sin cambios", (ruta) => {
    process.env.CLAUSURA_HOST = SUB;
    expect(sigue(llamar(ACTUAL, ruta))).toBe(true);
  });
  it("sin CLAUSURA_HOST configurada no hace nada, ni siquiera en el subdominio", () => {
    expect(sigue(llamar(SUB, "/login"))).toBe(true);
  });
});
