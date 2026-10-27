// Lanzador protegido para desarrollar el módulo de testimonios SOLO contra una base local.
// Uso (PowerShell o bash), siempre con la URI y la base explícitas:
//   MONGODB_URI=mongodb://127.0.0.1:27099 MONGODB_DB=testimonios_pruebas npm run dev:local-testimonios
// Se niega a arrancar si la URI no es local (Atlas, mongodb+srv, otro host) o si la base es la de producción.
// No usa --env-file: la URI de .env.local (producción) nunca se lee aquí; la explícita tiene prioridad en Next.
import { spawn } from "node:child_process";
import { assertBaseLocal } from "@/lib/testimonios/barrera";

const uri = assertBaseLocal(process.env.MONGODB_URI);
const db = process.env.MONGODB_DB ?? "";
if (!db || db === "validacion_jc") {
  console.error("BLOQUEADO: define MONGODB_DB con una base de prueba (p. ej. testimonios_pruebas), nunca validacion_jc.");
  process.exit(1);
}
const puerto = process.env.PORT ?? "3200";
console.log(`Base LOCAL verificada: ${uri} · base "${db}" · http://localhost:${puerto}`);
const hijo = spawn("npx", ["next", "dev", "-p", puerto], { stdio: "inherit", shell: true, env: { ...process.env, MONGODB_URI: uri, MONGODB_DB: db } });
hijo.on("exit", (code) => process.exit(code ?? 0));
