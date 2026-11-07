// Cookie del estudiante en la clausura: después de entrar con su documento, identifica al estudiante y al evento en el
// autoguardado (no se reenvía el documento). httpOnly, firmada con HMAC (clave derivada de SESSION_SECRET con un
// prefijo propio, así no sirve como sesión de monitor) y de corta duración. No toca src/lib/auth.ts.
import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";

export const COOKIE_CLAUSURA = "vjc_clausura";
export const DURACION_MIN = 120;
/** Solo la reciben las rutas del estudiante. */
export const RUTA_COOKIE = "/api/clausura/estudiante";

function clave(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Falta SESSION_SECRET (mínimo 16 caracteres)");
  return `clausura:${s}`;
}
const firmar = (data: string) => createHmac("sha256", clave()).update(data).digest("base64url");

export type SesionClausura = { studentId: string; eventoId: string };

export function crearToken(s: SesionClausura, ahora = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ s: s.studentId, e: s.eventoId, exp: ahora + DURACION_MIN * 60_000 })).toString("base64url");
  return `${data}.${firmar(data)}`;
}

export function leerToken(token: string | undefined, ahora = Date.now()): SesionClausura | null {
  if (!token) return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(firmar(data));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { s, e, exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof s === "string" && typeof e === "string" && ObjectId.isValid(s) && ObjectId.isValid(e) && exp > ahora ? { studentId: s, eventoId: e } : null;
  } catch {
    return null;
  }
}

export const opcionesCookie = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: RUTA_COOKIE,
  maxAge: DURACION_MIN * 60,
};

export async function sesionActual(): Promise<SesionClausura | null> {
  return leerToken((await cookies()).get(COOKIE_CLAUSURA)?.value);
}
