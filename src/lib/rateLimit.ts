import { collections } from "./db";

// Límite de intentos FALLIDOS por IP, guardado en MongoDB (colección rateLimits, con TTL).
// Solo cuentan los fallos (documento no encontrado, usuario/clave incorrectos): así un salón entero
// detrás de la misma IP puede validar sin bloquearse, pero probar números o claves sí se frena.
// Ventanas fijas: la clave incluye el número de ventana, y Mongo borra los registros viejos solo.

export const LIMITE_INTENTOS = Number(process.env.RATE_LIMIT_MAX) || 20;
export const VENTANA_MS = 15 * 60 * 1000;

export type TipoLimite = "buscar" | "login";

/** IP del cliente. En Vercel llega en x-real-ip / x-forwarded-for (la primera es la del cliente). */
export function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0]!.trim() : "local";
}

function clave(tipo: TipoLimite, ip: string, now = Date.now()) {
  const ventana = Math.floor(now / VENTANA_MS);
  return { _id: `${tipo}:${ip}:${ventana}`, expiraEn: new Date((ventana + 1) * VENTANA_MS) };
}

/** true si esta IP ya llegó al límite de fallos en la ventana actual. */
export async function bloqueado(tipo: TipoLimite, req: Request): Promise<boolean> {
  const { rateLimits } = await collections();
  const doc = await rateLimits.findOne({ _id: clave(tipo, clientIp(req))._id });
  return (doc?.count ?? 0) >= LIMITE_INTENTOS;
}

/** Suma un intento fallido para esta IP. */
export async function registrarFallo(tipo: TipoLimite, req: Request): Promise<void> {
  const { rateLimits } = await collections();
  const { _id, expiraEn } = clave(tipo, clientIp(req));
  await rateLimits.updateOne({ _id }, { $inc: { count: 1 }, $setOnInsert: { expiraEn } }, { upsert: true });
}

export const MENSAJE_BLOQUEO = "Demasiados intentos. Espera unos minutos e intenta otra vez.";
