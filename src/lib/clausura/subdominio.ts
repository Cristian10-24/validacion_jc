// Subdominio exclusivo para estudiantes (p. ej. clausura.tocaunavida.org, en CLAUSURA_HOST).
// En ese host solo funcionan el formulario de clausura y lo que necesita; todo lo demás va a /clausura.
// En cualquier otro host (validacion.tocaunavida.org, localhost…) no se toca nada.
// Función pura: la usa src/proxy.ts y la prueban tests/clausura-subdominio.test.ts.
import { SLUGS_RESERVADOS } from "./evento";

export type Decision = { tipo: "seguir" } | { tipo: "redirigir"; a: string };

/** Host sin puerto y en minúsculas. */
export const limpiarHost = (h: string | null | undefined) => String(h ?? "").split(",")[0]!.trim().toLowerCase().replace(/:\d+$/, "");

/** Rutas que sí sirven en el subdominio de estudiantes. */
export function permitidaEnSubdominio(ruta: string, metodo: string): boolean {
  if (ruta === "/clausura") return true;
  // /clausura/<slug> (portada de un evento), pero no las páginas del panel (/clausura/panel, /resumen, /eventos).
  const m = /^\/clausura\/([^/]+)$/.exec(ruta);
  if (m) return !SLUGS_RESERVADOS.includes(m[1]!.toLowerCase());
  // Imágenes y archivos estáticos del módulo (public/clausura/…).
  if (/^\/clausura\/.+\.(jpg|jpeg|png|webp|svg)$/i.test(ruta)) return true;
  // APIs del formulario del estudiante, calendario y portadas (solo lectura de imágenes).
  if (ruta.startsWith("/api/clausura/estudiante/")) return true;
  if (ruta.startsWith("/api/clausura/calendario/")) return true;
  if (/^\/api\/clausura\/imagenes\/[a-f0-9]{24}$/i.test(ruta) && metodo === "GET") return true;
  // Recursos de Next y del sitio.
  if (ruta.startsWith("/_next/")) return true;
  if (["/logo-jc.png", "/favicon.ico", "/robots.txt"].includes(ruta)) return true;
  return false;
}

/**
 * Qué hacer con una petición. hostClausura vacío = subdominio desactivado (no cambia nada).
 * En el subdominio: "/" y cualquier ruta no permitida → redirigen a /clausura.
 */
export function decidir(host: string, ruta: string, metodo: string, hostClausura: string | undefined): Decision {
  const objetivo = limpiarHost(hostClausura);
  if (!objetivo || limpiarHost(host) !== objetivo) return { tipo: "seguir" };
  if (permitidaEnSubdominio(ruta, metodo)) return { tipo: "seguir" };
  return { tipo: "redirigir", a: "/clausura" };
}
