// Simula el Google Sheet en LOCAL: carga participantes ficticios en la base local y envía respuestas
// ficticias al webhook del servidor local, como lo haría el Apps Script.
//
// Uso (las tres variables son obligatorias y deben apuntar a lo local):
//   MONGODB_URI=mongodb://127.0.0.1:27099 MONGODB_DB=testimonios_pruebas \
//   TESTIMONIOS_URL=http://localhost:3200/api/testimonios/webhook TESTIMONIOS_WEBHOOK_SECRET=... \
//   npx tsx scripts/testimonios-simular.ts
import { ObjectId } from "mongodb";
import { closeDb } from "@/lib/db";
import { assertBaseLocal } from "@/lib/testimonios/barrera";
import { ciudadDelCatalogo } from "@/lib/testimonios/ciudades";
import { claveCelular } from "@/lib/testimonios/cruce";
import { testimonios } from "@/lib/testimonios/db";
import { toProperName } from "@/lib/validation/name";

assertBaseLocal(process.env.MONGODB_URI);
if (!process.env.MONGODB_DB || process.env.MONGODB_DB === "validacion_jc") throw new Error("BLOQUEADO: usa una base de prueba (MONGODB_DB=testimonios_pruebas).");
const URL_WEBHOOK = process.env.TESTIMONIOS_URL ?? "";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(URL_WEBHOOK)) throw new Error("BLOQUEADO: TESTIMONIOS_URL debe ser el servidor local (http://localhost:PUERTO/...).");
const SECRETO = process.env.TESTIMONIOS_WEBHOOK_SECRET ?? "";

const PARTICIPANTES = [
  ["Valentina", "Gómez Ríos", "+57 300 111 2233", "valentina.gomez@gmail.com", "1001", "Bogotá D.C."],
  ["Santiago", "Rodríguez Peña", "300 444 5566", "santiago.rodriguez@gmail.com", "1002", "Bogotá D.C."],
  ["Mariana", "Martínez Cano", "3007778899", "familia.martinez@gmail.com", "1003", "Bogotá D.C."],
  ["Mateo", "Martínez Cano", "3001231234", "familia.martinez@gmail.com", "1004", "Bogotá D.C."], // hermano: mismo correo
  ["Sofía", "Pérez Salazar", "+507 6123-4567", "sofia.perez@gmail.com", "2001", "Ciudad de Panamá"],
  ["Tomás", "Jiménez Quintero", "+593 99 123 4567", "tomas.jimenez@gmail.com", "3001", "Guayaquil"],
  ["Lucía", "Fernández Paz", "+598 94 123 456", "lucia.fernandez@gmail.com", "4001", "Uruguay"],
] as const;

const enc = { mt: "Marca temporal", n: "Nombre Completo", d: "Número de documento", c: "Correo", w: "Número de WhatsApp o Celular", ci: "Ciudad a la que perteneces", v: "¡Sube aquí tu testimonio!" };
const resp = (fila: number, mt: string, n: string, d: string, c: string, w: string | null, ci: string, v: string) => ({
  fila, respuesta: { [enc.mt]: mt, [enc.n]: n, [enc.d]: d, [enc.c]: c, ...(w === null ? {} : { [enc.w]: w }), [enc.ci]: ci, [enc.v]: v },
});
const RESPUESTAS = [
  resp(2, "20/10/2026 9:10:00", "Valentina Gómez", "1.001", "valentina.gomez@gmail.com", null, "Bogotá D.C.", "https://drive.google.com/file/d/vale-1"),          // vieja, sin celular → documento
  resp(3, "21/10/2026 14:00:00", "Santi R", "", "SANTIAGO.RODRIGUEZ@gmail.com", "", "Bogotá", "https://drive.google.com/file/d/santi-1"),               // sin documento → correo
  resp(4, "22/10/2026 8:30:00", "Sofi", "", "otro@hotmail.com", "6123 4567", "Panamá", "https://drive.google.com/file/d/sofi-1, https://drive.google.com/file/d/sofi-2"), // celular sin +507, 2 enlaces
  resp(5, "22/10/2026 11:00:00", "Mateo Martínez", "1004", "familia.martinez@gmail.com", "", "Bogotá D.C.", "https://drive.google.com/file/d/mateo-1"),  // hermano: gana el documento
  resp(6, "23/10/2026 16:45:00", "Martínez", "", "familia.martinez@gmail.com", "", "Bogotá D.C.", "https://drive.google.com/file/d/martinez-x"),        // correo compartido, sin documento → conflicto
  resp(7, "24/10/2026 10:00:00", "Alguien Nuevo", "9999", "nuevo@gmail.com", "3110000000", "Cali", "https://drive.google.com/file/d/nadie"),            // sin dueño
  resp(8, "25/10/2026 18:20:00", "Valentina Gómez", "1001", "valentina.gomez@gmail.com", "+57 300 111 2233", "Bogotá D.C.", "https://drive.google.com/file/d/vale-2"), // segundo envío de Valentina
  resp(9, "25/10/2026 19:00:00", "Tomás J", "", "", "099 123 4567", "Guayaquil", "https://drive.google.com/file/d/tomas-1"),                         // celular Ecuador con 0
];

async function enviar(cuerpo: unknown, secreto = SECRETO) {
  const r = await fetch(URL_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json", "X-Testimonios-Secret": secreto }, body: JSON.stringify(cuerpo) });
  return { status: r.status, data: await r.json().catch(() => null) };
}

async function main() {
  const { participantes, respuestas } = await testimonios();
  await participantes.deleteMany({});
  await respuestas.deleteMany({});
  const now = new Date();
  await participantes.insertMany(PARTICIPANTES.map(([nombres, apellidos, cel, correo, documento, ciudad]) => ({
    _id: new ObjectId(), documento, nombres, apellidos, nombre: toProperName(`${nombres} ${apellidos}`),
    celular: cel.replace(/\D/g, ""), celularClave: claveCelular(cel), correo, ciudad: ciudadDelCatalogo(ciudad) ?? ciudad, creadoEn: now, actualizadoEn: now,
  })));
  console.log(`Participantes ficticios en la base local: ${PARTICIPANTES.length}`);

  console.log("1) sin secreto →", (await enviar(RESPUESTAS[0], "")).status, "(esperado 401)");
  console.log("2) secreto incorrecto →", (await enviar(RESPUESTAS[0], "x".repeat(40))).status, "(esperado 401)");
  const uno = await enviar(RESPUESTAS[0]);
  console.log("3) activador (una respuesta) →", uno.status, JSON.stringify(uno.data?.resultados));
  const lote = await enviar({ respuestas: RESPUESTAS });
  console.log("4) carga inicial (todas) →", lote.status, `nuevas ${lote.data?.nuevas} · duplicadas ${lote.data?.duplicadas} · inválidas ${lote.data?.invalidas}`);
  const otra = await enviar({ respuestas: RESPUESTAS });
  console.log("5) carga inicial repetida →", otra.status, `nuevas ${otra.data?.nuevas} · duplicadas ${otra.data?.duplicadas}`, "(esperado 0 nuevas)");

  const nombres = new Map((await participantes.find({}).toArray()).map((p) => [p._id.toHexString(), p.nombre]));
  console.log("\nRespuestas guardadas en testimonios_respuestas (base local):");
  for (const r of await respuestas.find({}).sort({ fila: 1 }).toArray())
    console.log(`  fila ${r.fila}: ${r.cruce.padEnd(10)} ${r.cruzadoPor ? `por ${r.cruzadoPor}`.padEnd(14) : "".padEnd(14)} → ${r.participanteId ? nombres.get(r.participanteId.toHexString()) : r.candidatos ? "candidatos: " + r.candidatos.map((c) => nombres.get(c.toHexString())).join(" / ") : "—"} · ${r.enlaces.length} enlace(s)`);
  console.log("Total:", await respuestas.countDocuments());
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(closeDb);
