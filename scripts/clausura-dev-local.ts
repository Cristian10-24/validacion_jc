// Lanzador protegido para probar el módulo de clausura SOLO contra una base local (nunca .env.local).
//   MONGODB_URI=mongodb://127.0.0.1:27099 MONGODB_DB=clausura_pruebas SESSION_SECRET=… npm run dev:local-clausura
// Se niega a arrancar si la URI no es local o si la base es la de producción. Para cargar datos ficticios,
// antes: npx tsx scripts/clausura-semilla-local.ts (con las mismas variables).
import { spawn } from "node:child_process";
import { assertBaseLocal } from "@/lib/testimonios/barrera";

const uri = assertBaseLocal(process.env.MONGODB_URI);
const db = process.env.MONGODB_DB ?? "";
if (!db || db === "validacion_jc") {
  console.error("BLOQUEADO: define MONGODB_DB con una base de prueba (p. ej. clausura_pruebas), nunca validacion_jc.");
  process.exit(1);
}
if ((process.env.SESSION_SECRET ?? "").length < 16) {
  console.error("Falta SESSION_SECRET (16+ caracteres) para las cookies de prueba.");
  process.exit(1);
}
const puerto = process.env.PORT ?? "3300";
console.log(`Base LOCAL verificada: ${uri} · base "${db}" · http://localhost:${puerto}/clausura`);
const hijo = spawn("npx", ["next", "dev", "-p", puerto], { stdio: "inherit", shell: true, env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: db } });
hijo.on("exit", (code) => process.exit(code ?? 0));
