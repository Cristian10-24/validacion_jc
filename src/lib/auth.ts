import { createHmac, timingSafeEqual } from "node:crypto";
import { ObjectId, type Filter } from "mongodb";
import { cookies } from "next/headers";
import { collections } from "./db";
import type { Student, User } from "./types";

// Sesión de monitor/admin: cookie httpOnly con { uid, exp } firmado con HMAC.
// En cada petición se vuelve a leer el usuario, así que desactivarlo o cambiar sus ciudades aplica de inmediato.

export const SESSION_COOKIE = "vjc_session";
export const SESSION_DAYS = 7;

export type SessionUser = Pick<User, "usuario" | "nombre" | "rol" | "ciudades"> & { id: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("Falta SESSION_SECRET (mínimo 16 caracteres)");
  return s;
}

const sign = (data: string) => createHmac("sha256", secret()).update(data).digest("base64url");

export function createToken(userId: string): string {
  const data = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${data}.${sign(data)}`;
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const a = Buffer.from(mac), b = Buffer.from(sign(data));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(data, "base64url").toString());
    return typeof uid === "string" && ObjectId.isValid(uid) && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 86400,
};

/** Usuario de la sesión actual, o null. Sirve en páginas y en route handlers. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const uid = readToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!uid) return null;
  const { users } = await collections();
  const u = await users.findOne({ _id: new ObjectId(uid), activo: true }, { projection: { passwordHash: 0 } });
  return u ? { id: u._id.toHexString(), usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades } : null;
}

/** Filtro obligatorio en toda consulta de estudiantes: el monitor solo ve sus ciudades. */
export function scopeFilter(user: Pick<SessionUser, "rol" | "ciudades">): Filter<Student> {
  return user.rol === "admin" ? {} : { ciudad: { $in: user.ciudades } };
}

/** Rechaza mutaciones que vengan de otro sitio (complementa SameSite=Lax). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true; // mismo origen en navegadores que no la envían
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}
