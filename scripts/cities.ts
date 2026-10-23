// Uso: npm run cities:fix [-- --dry-run]
// Vuelve a normalizar las ciudades ya guardadas (estudiantes y monitores) con normalizeCity,
// por ejemplo después de agregar un nombre oficial en CIUDADES_OFICIALES.
import { closeDb, collections, dbHost, dbName } from "@/lib/db";
import { normalizeCity } from "@/lib/validation/name";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}${dryRun ? "  [SIMULACIÓN]" : ""}`);
  const { students, users } = await collections();

  for (const ciudad of await students.distinct("ciudad")) {
    const nueva = normalizeCity(ciudad);
    if (nueva === ciudad) continue;
    const n = await students.countDocuments({ ciudad });
    console.log(`Estudiantes: "${ciudad}" → "${nueva}" (${n})`);
    if (!dryRun) await students.updateMany({ ciudad }, { $set: { ciudad: nueva } });
  }

  for (const u of await users.find({}).toArray()) {
    const nuevas = [...new Set(u.ciudades.map(normalizeCity))];
    if (nuevas.join("|") === u.ciudades.join("|")) continue;
    console.log(`Monitor ${u.usuario}: ${u.ciudades.join(", ")} → ${nuevas.join(", ")}`);
    if (!dryRun) await users.updateOne({ _id: u._id }, { $set: { ciudades: nuevas } });
  }

  console.table(Object.fromEntries((await students.aggregate<{ _id: string; n: number }>([{ $group: { _id: "$ciudad", n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray()).map((c) => [c._id, c.n])));
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
