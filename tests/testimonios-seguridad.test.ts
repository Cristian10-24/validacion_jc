import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assertBaseLocal } from "@/lib/testimonios/barrera";
import { COLECCIONES } from "@/lib/testimonios/db";

describe("barrera: solo bases locales", () => {
  it("acepta 127.0.0.1 y localhost", () => {
    for (const u of ["mongodb://127.0.0.1:27099", "mongodb://localhost:27017/db", "mongodb://usr:pwd@127.0.0.1:27099/?x=1"]) expect(assertBaseLocal(u)).toBe(u);
  });
  it("rechaza Atlas y cualquier host remoto", () => {
    for (const u of [
      "mongodb+srv://u:p@cluster0.abcde.mongodb.net/?retryWrites=true",
      "mongodb://u:p@cluster0-shard-00-00.abcde.mongodb.net:27017",
      "mongodb://10.0.0.5:27017",
      "mongodb://127.0.0.1:27017,db.example.com:27017",
      "",
      undefined,
    ]) expect(() => assertBaseLocal(u as string), String(u)).toThrow();
  });
});

// ---------- El módulo solo escribe en colecciones testimonios_* ----------

const RAIZ = path.resolve(__dirname, "..");
function archivos(dir: string, filtro: (p: string) => boolean, acc: string[] = []): string[] {
  let entradas: string[];
  try { entradas = readdirSync(dir); } catch { return acc; }
  for (const e of entradas) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, filtro, acc);
    else if (filtro(p)) acc.push(p);
  }
  return acc;
}
const esModulo = (p: string) => /\.(ts|tsx|mjs|cjs|js)$/.test(p) && /testimonios/i.test(path.relative(RAIZ, p));
const codigoModulo = [
  ...archivos(path.join(RAIZ, "src"), esModulo),
  ...archivos(path.join(RAIZ, "scripts"), esModulo),
];

// Única lectura fuera de testimonios_*: los nombres de los monitores para el resumen.
const LECTURA_USERS = path.join("src", "lib", "testimonios", "usuarios-lectura.ts");

describe("el módulo no toca colecciones existentes", () => {
  it("hay código del módulo para revisar", () => expect(codigoModulo.length).toBeGreaterThan(0));

  it("todas las colecciones del módulo empiezan por testimonios_", () => {
    for (const nombre of Object.values(COLECCIONES)) expect(nombre.startsWith("testimonios_"), nombre).toBe(true);
  });

  it("ningún archivo del módulo usa collections() de @/lib/db (students, users, changeLog…)", () => {
    const malos = codigoModulo.filter((f) => /import\s*{[^}]*\bcollections\b[^}]*}\s*from\s*["']@\/lib\/db["']/.test(readFileSync(f, "utf8")));
    expect(malos.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it("toda llamada a .collection(...) usa una colección testimonios_*", () => {
    const problemas: string[] = [];
    for (const f of codigoModulo) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\.collection(?:<[^>]*>)?\(\s*([^),]+)/g)) {
        const arg = m[1].trim();
        const ok = /^COLECCIONES\.\w+$/.test(arg) || /^["'`]testimonios_[\w]+["'`]$/.test(arg)
          || (path.relative(RAIZ, f) === LECTURA_USERS && arg === '"users"'); // única excepción, solo lectura (abajo)
        if (!ok) problemas.push(`${path.relative(RAIZ, f)}: .collection(${arg})`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it("la única lectura de users es un find() sin ninguna escritura", () => {
    const src = readFileSync(path.join(RAIZ, LECTURA_USERS), "utf8");
    expect(src).toMatch(/\.collection<[^>]*>\("users"\)\s*\.find\(/);
    expect(src).not.toMatch(/\b(insert\w*|update\w*|replace\w*|delete\w*|findOneAnd\w*|bulkWrite|createIndex\w*|drop\w*|aggregate)\s*\(/);
  });
});
