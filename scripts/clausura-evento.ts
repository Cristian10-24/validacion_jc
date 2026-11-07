// Crear o actualizar un evento de clausura desde un archivo JSON (mientras llega el editor visual).
//
//   npm run clausura:evento -- eventos/cali.json --dry-run          revisa y muestra qué haría, sin escribir
//   npm run clausura:evento -- eventos/cali.json --confirmar        crea o actualiza (upsert por slug)
//   npm run clausura:evento -- eventos/cali.json --estado=abierto --confirmar   igual, pero con ese estado
//   npm run clausura:evento -- --slug=cali-2026 --estado=cerrado --confirmar    solo abre o cierra
//
// Acepta JSON con comentarios (// …), como docs/clausura/ejemplo-evento.jsonc.
// Solo escribe en clausura_eventos, clausura_formularios y clausura_auditoria. students solo se lee (ciudades).
// Si la base NO es local, exige --confirmar (y muestra antes la base y el host).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ObjectId } from "mongodb";
import { closeDb, dbHost, dbName } from "@/lib/db";
import { clausura, type Evento } from "@/lib/clausura/db";
import { completarEjemplo, datosDesdeArchivo, EventoArchivo, mismaCiudad, pendientesDe, POR_DEFINIR, revisarEventoArchivo } from "@/lib/clausura/evento";
import { sinComentarios } from "@/lib/clausura/jsonc";
import { mismoFormulario, usadosEn, validarCambioFormulario, validarFormulario } from "@/lib/clausura/formulario/motor";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const bandera = (n: string) => process.argv.includes(`--${n}`);
const fallar = (msg: string): never => { console.error(`\n✗ ${msg}\n`); process.exit(1); };

async function main() {
  const archivo = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const estadoArg = arg("estado");
  const slugArg = arg("slug");
  const dryRun = bandera("dry-run");
  const por = arg("por") ?? process.env.USERNAME ?? process.env.USER ?? "script";
  const edicionArg = arg("permitir-edicion");
  const ejemploLocal = bandera("ejemplo-local");
  if (estadoArg && !["borrador", "abierto", "cerrado"].includes(estadoArg)) fallar("--estado debe ser borrador, abierto o cerrado");
  if (edicionArg && !["si", "no"].includes(edicionArg)) fallar("--permitir-edicion debe ser si o no");
  if (!archivo && !(slugArg && (estadoArg || edicionArg))) fallar("Uso: npm run clausura:evento -- eventos/<ciudad>.json [--dry-run] [--estado=abierto|cerrado] [--permitir-edicion=si|no] [--confirmar]\n  o: npm run clausura:evento -- --slug=<slug> [--estado=abierto|cerrado] [--permitir-edicion=si|no] [--confirmar]");

  const local = /^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(`${process.env.MONGODB_URI ?? ""}/`);
  console.log(`Base de datos: ${dbName()} @ ${dbHost()}${local ? " (local)" : ""}${dryRun ? "  [SIMULACIÓN: no se escribe nada]" : ""}`);
  const puedeEscribir = !dryRun && (local || bandera("confirmar"));
  if (ejemploLocal && !local) fallar("--ejemplo-local solo se puede usar con una base local.");

  const { eventos, formularios, respuestas, auditoria, estudiantes } = await clausura();

  // ---- Solo abrir / cerrar ----
  if (!archivo) {
    const ev = await eventos.findOne({ slug: slugArg! });
    if (!ev) fallar(`No existe el evento "${slugArg}"`);
    if (estadoArg === "abierto") {
      const faltan = pendientesDe({ lugar: ev!.lugar, direccion: ev!.direccion, descripcion: ev!.descripcion, formulario: ev!.formulario });
      if (faltan.length) fallar(`No se puede abrir: faltan datos ${POR_DEFINIR}:\n${faltan.map((p) => `  - ${p}`).join("\n")}`);
      await revisarChoque(ev!.slug, ev!.ciudades);
    }
    const cambios: Partial<Evento> = {};
    if (estadoArg) cambios.estado = estadoArg as Evento["estado"];
    if (edicionArg) cambios.permitirEdicion = edicionArg === "si";
    console.log(`Evento "${ev!.slug}": ${estadoArg ? `estado ${ev!.estado} → ${estadoArg}` : ""}${edicionArg ? ` · editar después de enviar: ${ev!.permitirEdicion ? "sí" : "no"} → ${edicionArg}` : ""}`);
    if (!puedeEscribir) return console.log(dryRun ? "Simulación: no se escribió nada." : "No se escribió nada: la base no es local. Repite con --confirmar.");
    await eventos.updateOne({ _id: ev!._id }, { $set: { ...cambios, actualizadoEn: new Date(), actualizadoPor: por } });
    await auditoria.insertOne({ accion: "estado", eventoId: ev!._id, slug: ev!.slug, detalle: { antes: { estado: ev!.estado, permitirEdicion: ev!.permitirEdicion }, despues: cambios }, por, fecha: new Date() });
    return console.log("✓ Listo.");
  }

  // ---- Leer y validar el archivo ----
  const ruta = path.resolve(archivo);
  if (!existsSync(ruta)) fallar(`No existe el archivo ${ruta}`);
  let json: unknown;
  try { json = JSON.parse(sinComentarios(readFileSync(ruta, "utf8"))); } catch (e) { fallar(`El archivo no es JSON válido: ${(e as Error).message}`); }
  if (ejemploLocal) {
    json = completarEjemplo(json as Record<string, unknown>);
    console.log(`(solo local) Datos ${POR_DEFINIR} completados con valores de ejemplo.`);
  }
  const parsed = EventoArchivo.safeParse(json);
  if (!parsed.success) fallar(`El archivo tiene errores:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".") || "(raíz)"}: ${i.message}`).join("\n")}`);
  const e = parsed.data!;
  if (estadoArg) e.estado = estadoArg as typeof e.estado;
  if (edicionArg) e.permitirEdicion = edicionArg === "si";
  const problemas = [...validarFormulario(e.formulario), ...revisarEventoArchivo(e)];
  if (problemas.length) fallar(`El formulario tiene problemas:\n${problemas.map((p) => `  - ${p}`).join("\n")}`);

  // Primero lo informativo (solo lectura): ¿existe ya el evento? ¿cuántos estudiantes tiene cada ciudad?
  const yaExiste = await eventos.findOne({ slug: e.slug }, { projection: { estado: 1, proyecto: 1 } });
  console.log(yaExiste ? `  El evento "${e.slug}" ya existe (estado: ${yaExiste.estado}, proyecto: ${yaExiste.proyecto ?? "no"}).` : `  El evento "${e.slug}" todavía no existe.`);
  // Ciudades: deben existir en students (valor exacto), si no, nadie de esa ciudad encontrará el evento.
  const existentes = (await estudiantes.distinct("ciudad")) as string[];
  for (const c of e.ciudades) {
    if (existentes.includes(c)) {
      console.log(`  Estudiantes de ${c}: ${await estudiantes.countDocuments({ ciudad: c })}`);
      continue;
    }
    const parecida = existentes.find((x) => mismaCiudad(x, c));
    console.warn(parecida ? `⚠ La ciudad "${c}" en students se escribe "${parecida}". Usa ese valor exacto.` : `⚠ No hay estudiantes con la ciudad "${c}" (ciudades en la base: ${existentes.join(", ") || "ninguna"}).`);
  }

  // [POR DEFINIR]: con datos pendientes el evento no se puede abrir; sin fechas completas ni siquiera se guarda.
  const faltan = pendientesDe(json);
  if (faltan.length) {
    const lista = faltan.map((p) => `  - ${p}`).join("\n");
    if (e.estado !== "borrador") fallar(`No se puede ${e.estado === "abierto" ? "abrir" : "publicar"}: faltan datos ${POR_DEFINIR}:\n${lista}`);
    if (faltan.some((p) => ["inicio", "fin", "fechaLimite"].includes(p))) fallar(`Faltan fechas para guardarlo (ni siquiera como borrador):\n${lista}`);
    console.warn(`⚠ Se guarda como borrador. Para abrirlo faltan:\n${lista}`);
  }
  if (e.imagen && !existsSync(path.join(process.cwd(), "public", e.imagen))) console.warn(`⚠ La imagen ${e.imagen} no está en public/: súbela antes de publicar.`);

  if (e.estado === "abierto") await revisarChoque(e.slug, e.ciudades);

  // ---- Comparar con lo que ya existe ----
  const actual = await eventos.findOne({ slug: e.slug });
  const datos = datosDesdeArchivo(e);
  let version = 1;
  if (actual) {
    const resp = await respuestas.find({ eventoId: actual._id }, { projection: { respuestas: 1, borradorEdicion: 1 } }).toArray();
    const usados = usadosEn(resp.flatMap((r) => [r.respuestas, r.borradorEdicion?.respuestas ?? {}]));
    const cambios = validarCambioFormulario(actual.formulario, e.formulario, usados);
    if (cambios.length) fallar(`El cambio no se puede aplicar porque ya hay ${resp.length} respuesta(s):\n${cambios.map((p) => `  - ${p}`).join("\n")}`);
    version = mismoFormulario(actual.formulario, e.formulario) ? actual.formularioVersion : actual.formularioVersion + 1;
    console.log(`Actualizar "${e.slug}" · estado ${actual.estado} → ${e.estado} · formulario v${actual.formularioVersion}${version !== actual.formularioVersion ? ` → v${version}` : " (sin cambios)"} · ${resp.length} respuesta(s)`);
  } else {
    console.log(`Crear "${e.slug}" · estado ${e.estado} · formulario v1`);
  }
  const nPreguntas = e.formulario.secciones.reduce((n, s) => n + s.items.filter((i) => i.tipo !== "info").length, 0);
  console.log(`  ${e.titulo} · ${e.nombreVisible} (${e.ciudades.join(", ")}) · ${e.formulario.secciones.length} secciones, ${nPreguntas} preguntas`);

  if (!puedeEscribir) return console.log(dryRun ? "Simulación: no se escribió nada." : "No se escribió nada: la base no es local. Revisa lo de arriba y repite con --confirmar.");

  const ahora = new Date();
  if (actual) {
    await eventos.updateOne({ _id: actual._id }, { $set: { ...datos, formularioVersion: version, actualizadoEn: ahora, actualizadoPor: por } });
    if (version !== actual.formularioVersion) await formularios.insertOne({ _id: new ObjectId(), eventoId: actual._id, version, formulario: e.formulario, guardadoEn: ahora, guardadoPor: por });
    await auditoria.insertOne({ accion: "actualizar", eventoId: actual._id, slug: e.slug, detalle: { archivo: path.basename(ruta), version, estado: e.estado }, por, fecha: ahora });
  } else {
    const _id = new ObjectId();
    await eventos.insertOne({ _id, ...datos, formularioVersion: 1, creadoEn: ahora, actualizadoEn: ahora, actualizadoPor: por });
    await formularios.insertOne({ _id: new ObjectId(), eventoId: _id, version: 1, formulario: e.formulario, guardadoEn: ahora, guardadoPor: por });
    await auditoria.insertOne({ accion: "crear", eventoId: _id, slug: e.slug, detalle: { archivo: path.basename(ruta), estado: e.estado }, por, fecha: ahora });
  }
  console.log(`✓ Listo. Enlace: ${process.env.APP_URL ?? "https://validacion.tocaunavida.org"}/clausura/${e.slug}`);

  async function revisarChoque(slug: string, ciudades: string[]) {
    const otros = await eventos.find({ estado: "abierto", slug: { $ne: slug } }, { projection: { slug: 1, ciudades: 1 } }).toArray();
    const choque = otros.find((o) => o.ciudades.some((c) => ciudades.some((x) => mismaCiudad(c, x))));
    if (choque) fallar(`Ya hay otro evento abierto para esa ciudad: "${choque.slug}". Ciérralo primero (--slug=${choque.slug} --estado=cerrado).`);
  }
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(closeDb);
