import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COLECCIONES_CLAUSURA, LECTURA_CLAUSURA } from "@/lib/clausura/db";

// El módulo "Clausura" solo ESCRIBE en clausura_* y solo LEE students y testimonios_participantes.
// Única excepción aprobada: el límite de intentos fallidos (rateLimit.ts escribe en rateLimits).

const RAIZ = path.resolve(__dirname, "..");
function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(p) && /clausura/i.test(path.relative(RAIZ, p))) acc.push(p);
  }
  return acc;
}
const todos = [...archivos(path.join(RAIZ, "src")), ...archivos(path.join(RAIZ, "scripts"))];
// Excepción explícita: la semilla de prueba crea estudiantes y usuarios FICTICIOS, solo en una base local.
const esSemillaLocal = (f: string) => /semilla-local\.ts$/.test(f);
const codigo = todos.filter((f) => !esSemillaLocal(f));
const rel = (f: string) => path.relative(RAIZ, f);
const DB = path.join("src", "lib", "clausura", "db.ts");

describe("el módulo de clausura no toca colecciones ajenas", () => {
  it("hay código del módulo para revisar", () => expect(codigo.length).toBeGreaterThan(3));

  it("sus colecciones empiezan por clausura_; las de lectura son students y testimonios_participantes", () => {
    for (const nombre of Object.values(COLECCIONES_CLAUSURA)) expect(nombre.startsWith("clausura_"), nombre).toBe(true);
    expect(LECTURA_CLAUSURA).toEqual({ estudiantes: "students", participantes: "testimonios_participantes" });
  });

  it("ningún archivo usa collections() de @/lib/db (students, users, changeLog…)", () => {
    expect(codigo.filter((f) => /import\s*{[^}]*\bcollections\b[^}]*}\s*from\s*["']@\/lib\/db["']/.test(readFileSync(f, "utf8"))).map(rel)).toEqual([]);
  });

  it("solo db.ts abre colecciones, y solo clausura_* o las de lectura", () => {
    const problemas: string[] = [];
    for (const f of codigo) {
      for (const m of readFileSync(f, "utf8").matchAll(/\.collection(?:<[^>]*>)?\(\s*([^),]+)/g)) {
        const arg = m[1]!.trim();
        const ok = rel(f) === DB && (/^COLECCIONES_CLAUSURA\.\w+$/.test(arg) || /^LECTURA_CLAUSURA\.(estudiantes|participantes)$/.test(arg));
        if (!ok) problemas.push(`${rel(f)}: .collection(${arg})`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it("students y testimonios_participantes solo se leen (find / findOne / countDocuments / distinct)", () => {
    const problemas: string[] = [];
    for (const f of codigo) {
      for (const m of readFileSync(f, "utf8").matchAll(/\b(estudiantes|participantes)\s*\.\s*(\w+)\s*\(/g))
        if (!["find", "findOne", "countDocuments", "distinct"].includes(m[2]!)) problemas.push(`${rel(f)}: ${m[1]}.${m[2]}(`);
    }
    expect(problemas).toEqual([]);
  });

  it("la semilla de prueba solo corre contra una base local y nunca contra validacion_jc", () => {
    const semillas = todos.filter(esSemillaLocal);
    expect(semillas.length).toBe(1);
    for (const f of semillas) {
      const t = readFileSync(f, "utf8");
      expect(t.indexOf("assertBaseLocal(process.env.MONGODB_URI)"), rel(f)).toBeGreaterThan(-1);
      expect(t.indexOf("assertBaseLocal(process.env.MONGODB_URI)")).toBeLessThan(t.indexOf("getDb()"));
      expect(t).toMatch(/base === "validacion_jc"\) throw/);
    }
  });

  it("excepción explícita: rateLimits solo se toca a través de bloqueado() / registrarFallo() con el tipo 'clausura'", () => {
    const problemas: string[] = [];
    for (const f of codigo) {
      const t = readFileSync(f, "utf8").replace(/\/\/.*$/gm, ""); // sin comentarios
      if (/rateLimits/.test(t)) problemas.push(`${rel(f)}: usa rateLimits directamente`);
      for (const m of t.matchAll(/\b(bloqueado|registrarFallo)\(\s*"(\w+)"/g)) if (m[2] !== "clausura") problemas.push(`${rel(f)}: ${m[1]}("${m[2]}")`);
    }
    expect(problemas).toEqual([]);
  });
});
