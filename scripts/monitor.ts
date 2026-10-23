// Uso:
//   npm run monitor:add -- usuario "Nombre Apellido" "Ciudad1,Ciudad2" [--admin] [--clave=CLAVE]
//   npm run monitor:list
// Si el usuario ya existe, actualiza nombre/ciudades y la clave (la dada con --clave o una generada).
// --admin: ve todas las ciudades (coordinación).
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { closeDb, collections } from "@/lib/db";
import { cleanSpaces, normalizeCity } from "@/lib/validation/name";

function generarClave(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join("");
}

async function add(args: string[]) {
  const isAdmin = args.includes("--admin");
  const claveArg = args.find((a) => a.startsWith("--clave="))?.slice("--clave=".length);
  const [usuarioRaw, nombreRaw, ciudadesRaw = ""] = args.filter((a) => !a.startsWith("--"));
  const nombre = cleanSpaces(nombreRaw ?? "");
  if (!usuarioRaw || !nombre || (!isAdmin && !ciudadesRaw)) {
    console.error('Uso: npm run monitor:add -- usuario "Nombre" "Ciudad1,Ciudad2" [--admin] [--clave=CLAVE]');
    process.exit(1);
  }
  const usuario = usuarioRaw.trim().toLowerCase();
  const ciudades = [...new Set(ciudadesRaw.split(",").map(normalizeCity).filter(Boolean))];
  const { users, students } = await collections();

  for (const c of ciudades) {
    const n = await students.countDocuments({ ciudad: c });
    if (n === 0) console.warn(`⚠ No hay estudiantes en la ciudad "${c}". Revisa que esté escrita igual que en el Excel.`);
  }

  if (claveArg !== undefined && claveArg.length < 8) throw new Error("La clave debe tener al menos 8 caracteres");
  const clave = claveArg ?? generarClave();
  await users.updateOne(
    { usuario },
    {
      $set: { nombre, ciudades, rol: isAdmin ? "admin" : "monitor", activo: true, passwordHash: await bcrypt.hash(clave, 12) },
      $setOnInsert: { creadoEn: new Date() },
    },
    { upsert: true },
  );
  console.log(`\n${isAdmin ? "Admin" : "Monitor"} listo:\n  Usuario: ${usuario}\n  Clave:   ${clave}\n  Ciudades: ${isAdmin ? "todas (coordinación)" : ciudades.join(", ")}`);
}

async function list() {
  const { users } = await collections();
  const all = await users.find({}, { projection: { passwordHash: 0 } }).sort({ rol: 1, usuario: 1 }).toArray();
  console.table(all.map((u) => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, ciudades: u.ciudades.join(", "), activo: u.activo })));
}

const [cmd, ...rest] = process.argv.slice(2);
(cmd === "add" ? add(rest) : list())
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
