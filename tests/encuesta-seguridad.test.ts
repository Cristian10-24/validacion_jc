import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLECCIONES_ENCUESTA, PARTICIPANTES_LECTURA } from "@/lib/encuesta/db";

// El módulo "Encuesta final" solo escribe en encuesta_* y solo LEE la lista de participantes de testimonios.

const RAIZ = path.resolve(__dirname, "..");
function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(p) && /encuesta/i.test(path.relative(RAIZ, p))) acc.push(p);
  }
  return acc;
}
const codigo = archivos(path.join(RAIZ, "src"));
const rel = (f: string) => path.relative(RAIZ, f);

describe("el módulo de la encuesta no toca colecciones ajenas", () => {
  it("hay código del módulo para revisar", () => expect(codigo.length).toBeGreaterThan(5));

  it("sus colecciones empiezan por encuesta_", () => {
    for (const nombre of Object.values(COLECCIONES_ENCUESTA)) expect(nombre.startsWith("encuesta_"), nombre).toBe(true);
    expect(PARTICIPANTES_LECTURA).toBe("testimonios_participantes");
  });

  it("ningún archivo usa collections() de @/lib/db (students, users, changeLog…)", () => {
    expect(codigo.filter((f) => /import\s*{[^}]*\bcollections\b[^}]*}\s*from\s*["']@\/lib\/db["']/.test(readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });

  it("solo db.ts abre colecciones, y solo encuesta_* o la lista de participantes", () => {
    const problemas: string[] = [];
    for (const f of codigo) {
      for (const m of readFileSync(f, "utf8").matchAll(/\.collection(?:<[^>]*>)?\(\s*([^),]+)/g)) {
        const arg = m[1].trim();
        const ok = rel(f) === path.join("src", "lib", "encuesta", "db.ts") && (/^COLECCIONES_ENCUESTA\.\w+$/.test(arg) || arg === "PARTICIPANTES_LECTURA");
        if (!ok) problemas.push(`${rel(f)}: .collection(${arg})`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it("la lista de participantes solo se lee (find / findOne / countDocuments)", () => {
    const problemas: string[] = [];
    for (const f of codigo) {
      for (const m of readFileSync(f, "utf8").matchAll(/participantes\s*\.\s*(\w+)\s*\(/g))
        if (!["find", "findOne", "countDocuments"].includes(m[1])) problemas.push(`${rel(f)}: participantes.${m[1]}(`);
    }
    expect(problemas).toEqual([]);
  });
});
