// Proxy (antes "middleware" en Next.js): subdominio exclusivo para estudiantes de la clausura.
// Si la petición NO llega por CLAUSURA_HOST (p. ej. validacion.tocaunavida.org), se deja pasar sin cambios.
// En CLAUSURA_HOST solo funcionan el formulario de clausura y sus recursos; lo demás redirige a /clausura.
// Sin CLAUSURA_HOST configurada, no hace nada. La lógica está en src/lib/clausura/subdominio.ts (con pruebas).
import { NextResponse, type NextRequest } from "next/server";
import { decidir } from "@/lib/clausura/subdominio";

export function proxy(request: NextRequest) {
  const hostClausura = process.env.CLAUSURA_HOST;
  if (!hostClausura) return NextResponse.next();
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const d = decidir(host, request.nextUrl.pathname, request.method, hostClausura);
  if (d.tipo === "seguir") return NextResponse.next();
  // Al mismo host por el que entró (clausura.tocaunavida.org), nunca al dominio interno.
  const proto = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  return NextResponse.redirect(new URL(d.a, `${proto}://${host.split(",")[0]!.trim()}`), 307);
}

export const config = {
  // Todo menos los archivos estáticos de Next (que el formulario necesita y no exponen nada).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
