// Barrera para el desarrollo y las pruebas del módulo de testimonios.
// Aborta si la URI de MongoDB no es una base LOCAL (127.0.0.1 / localhost / ::1).
// Se usa en pruebas, scripts y el lanzador de desarrollo; NO dentro de la app, porque en producción la URI es Atlas.

const HOSTS_LOCALES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export class BaseNoLocalError extends Error {}

/** Lanza un error si la URI apunta a algo que no sea una base local. Devuelve la URI si es segura. */
export function assertBaseLocal(uri: string | undefined): string {
  if (!uri) throw new BaseNoLocalError("Falta MONGODB_URI (debe ser una base local, p. ej. mongodb://127.0.0.1:27099).");
  if (/mongodb\.net/i.test(uri) || /mongodb\+srv/i.test(uri))
    throw new BaseNoLocalError("BLOQUEADO: la URI apunta a Atlas (mongodb.net / mongodb+srv). Este módulo solo se prueba con una base local.");
  const m = /^mongodb:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri);
  if (!m) throw new BaseNoLocalError("BLOQUEADO: la URI no tiene el formato mongodb://host:puerto.");
  const hosts = m[1].split(",").map((h) => (h.startsWith("[") ? h.slice(0, h.indexOf("]") + 1) : h.split(":")[0]).toLowerCase());
  const ajenos = hosts.filter((h) => !HOSTS_LOCALES.has(h));
  if (ajenos.length) throw new BaseNoLocalError(`BLOQUEADO: host no local (${ajenos.join(", ")}). Solo se permite 127.0.0.1 o localhost.`);
  return uri;
}
