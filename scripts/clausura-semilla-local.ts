// Semilla de prueba del módulo de clausura: SOLO base local y datos FICTICIOS.
// Borra y vuelve a crear la base de prueba indicada (nunca validacion_jc) con estudiantes, participantes, usuarios
// y los eventos de eventos/*.json abiertos.
//
//   MONGODB_URI=mongodb://127.0.0.1:27099 MONGODB_DB=clausura_pruebas npx tsx scripts/clausura-semilla-local.ts
//
// Usuarios de prueba (solo para esta base local): admin-local, coord-local, monitor-cali, monitor-cartagena.
// Clave de todos: clausura-local-2026
import { spawnSync } from "node:child_process";
import { ObjectId } from "mongodb";
import { closeDb, getDb } from "@/lib/db";
import { assertBaseLocal } from "@/lib/testimonios/barrera";
import { hashClave } from "@/lib/usuarios";

const uri = assertBaseLocal(process.env.MONGODB_URI);
const base = process.env.MONGODB_DB ?? "";
if (!base || base === "validacion_jc") throw new Error("BLOQUEADO: usa una base de prueba (MONGODB_DB=clausura_pruebas), nunca validacion_jc.");

const CLAVE = "clausura-local-2026";
const ESTUDIANTES: [string, string, string, string, string, string, Record<string, unknown>?][] = [
  // documento, nombre, correo, ciudad, grupo, estado
  ["1001", "Valentina Gómez Ríos", "valentina.gomez@gmail.com", "Cali", "Cali 1", "validado"],
  ["1002", "Santiago Rodríguez Peña", "santiago.rodriguez@gmail.com", "Cali", "Cali 1", "pendiente"],
  ["1003", "Mariana Martínez Cano", "mariana.mc@hotmail.com", "Cali", "Cali 2", "corregido", { nombrePropuesto: "Mariana Martínez Cano", correoPropuesto: "marianamartinez@gmail.com" }],
  ["1004", "Mateo López Díaz", "mateo.lopez@gmail.com", "Cali", "Cali 2", "validado"],
  ["2001", "Sofía Pérez Salazar", "sofia.perez@gmail.com", "Cartagena", "Cartagena 1", "validado"],
  ["2002", "Tomás Jiménez Quintero", "tomas.jimenez@gmail.com", "Cartagena", "Cartagena 1", "validado"],
  ["3001", "Lucía Fernández Paz", "lucia.fernandez@gmail.com", "Bogotá D.C.", "Bogotá 1", "validado"],
];
const CELULARES: Record<string, string> = { "1001": "3001112233", "1002": "3154445566", "2001": "3007778899" };

async function main() {
  console.log(`Base LOCAL: ${uri} · ${base}`);
  const db = await getDb();
  await db.dropDatabase();
  const db2 = await getDb();
  const ahora = new Date();
  await db2.collection("students").insertMany(ESTUDIANTES.map(([documento, nombre, correo, ciudad, grupo, estado, extra]) => ({
    _id: new ObjectId(), documento, ciudad, grupo, monitorRef: "", nombreOriginal: nombre, correoOriginal: correo, nombre, correo,
    correoNorm: correo, estado, aceptaCorreoPersonal: estado !== "pendiente", creadoEn: ahora, actualizadoEn: ahora, ...extra,
  })));
  await db2.collection("testimonios_participantes").insertMany(Object.entries(CELULARES).map(([documento, celular]) => {
    const e = ESTUDIANTES.find((x) => x[0] === documento)!;
    return { _id: new ObjectId(), documento, nombre: e[1], nombres: e[1], apellidos: "", correo: e[2], celular, celular10: celular.slice(-10), ciudad: e[3], creadoEn: ahora, actualizadoEn: ahora };
  }));
  const hash = await hashClave(CLAVE);
  await db2.collection("users").insertMany([
    ["admin-local", "Admin Local", "admin", []],
    ["coord-local", "Coordinación Local", "coordinador", []],
    ["monitor-cali", "Monitora Cali", "monitor", ["Cali"]],
    ["monitor-cartagena", "Monitor Cartagena", "monitor", ["Cartagena"]],
  ].map(([usuario, nombre, rol, ciudades]) => ({ _id: new ObjectId(), usuario, nombre, passwordHash: hash, rol, ciudades, activo: true, tokenVersion: 0, creadoEn: ahora })));
  await closeDb();

  for (const f of ["eventos/cali.json", "eventos/cartagena.json"]) {
    const r = spawnSync("npx", ["tsx", "scripts/clausura-evento.ts", f, "--estado=abierto", "--ejemplo-local", "--por=semilla"], { stdio: "inherit", shell: true, env: process.env });
    if (r.status !== 0) throw new Error(`No se pudo cargar ${f}`);
  }
  console.log(`\n✓ Semilla lista. Usuarios: admin-local, coord-local, monitor-cali, monitor-cartagena · clave ${CLAVE}`);
  console.log("  Documentos: Cali 1001–1004 · Cartagena 2001–2002 · Bogotá 3001 (sin evento) · 9999 (no existe)");
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(closeDb);
