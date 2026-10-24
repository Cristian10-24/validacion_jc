import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { collections } from "@/lib/db";
import { logChanges } from "@/lib/history";
import { correosRepetidos, monitorRow } from "@/lib/monitor-view";
import type { Actor, ChangeLog, Student } from "@/lib/types";
import { checkEmail, emailError } from "@/lib/validation/email";
import { ciudadExistente, cleanSpaces, nameWarnings, normalizeCity, normalizeDocumento, toProperName } from "@/lib/validation/name";

const Body = z.object({
  documento: z.string().max(30),
  nombre: z.string().max(150),
  correo: z.string().max(150),
  ciudad: z.string().max(80),
  grupo: z.string().max(80),
  estado: z.enum(["pendiente", "corregido", "validado"]),
}).strict();

/**
 * Edición completa de un estudiante (solo administración), aunque ya esté validado.
 * El documento se normaliza como en la importación y se rechaza si ya lo tiene otro estudiante.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("editar_todo");
  if (g.error) return g.error;

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "Revisa los datos." }, { status: 400 });
  const b = parsed.data;

  const documento = normalizeDocumento(b.documento);
  const nombre = toProperName(b.nombre);
  let ciudad = normalizeCity(b.ciudad);
  const grupo = cleanSpaces(b.grupo);
  const email = checkEmail(b.correo);
  const errCorreo = emailError(email);
  if (!documento) return NextResponse.json({ error: "documento", mensaje: "Escribe el número de documento." }, { status: 422 });
  if (nameWarnings(nombre).includes("incompleto")) return NextResponse.json({ error: "nombre", mensaje: "Escribe el nombre completo: nombres y apellidos." }, { status: 422 });
  if (errCorreo) return NextResponse.json({ error: "correo", mensaje: errCorreo }, { status: 422 });
  if (!ciudad) return NextResponse.json({ error: "ciudad", mensaje: "Escribe la ciudad." }, { status: 422 });

  const { students } = await collections();
  // "medellin" → "Medellín": se reutiliza la ciudad que ya existe para no partir la lista del monitor.
  ciudad = ciudadExistente(ciudad, await students.distinct("ciudad"));
  const _id = new ObjectId(id);
  const actual = await students.findOne({ _id });
  if (!actual) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  if (documento !== actual.documento && (await students.findOne({ documento, _id: { $ne: _id } })))
    return NextResponse.json({ error: "documento_duplicado", mensaje: `El documento ${documento} ya pertenece a otro estudiante.` }, { status: 409 });

  const actor: Actor = { rol: g.user.rol, usuario: g.user.usuario };
  const now = new Date();
  // Si queda "corregido" se conserva la propuesta del estudiante; en otro estado, lo editado es el dato oficial.
  const conservaPropuesta = b.estado === "corregido";
  const set: Partial<Student> = { documento, nombre, correo: email.email, correoNorm: email.email, ciudad, grupo, estado: b.estado, actualizadoEn: now };
  const unset: Record<string, ""> = conservaPropuesta ? {} : { nombrePropuesto: "", correoPropuesto: "" };
  if (b.estado === "validado" && actual.estado !== "validado") Object.assign(set, { validadoPor: actor, validadoEn: now });
  if (b.estado !== "validado") Object.assign(unset, { validadoPor: "", validadoEn: "" });

  try {
    await students.updateOne({ _id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) });
  } catch (e) {
    // Carrera con otro cambio de documento: el índice único lo frena.
    if ((e as { code?: number }).code === 11000) return NextResponse.json({ error: "documento_duplicado", mensaje: `El documento ${documento} ya pertenece a otro estudiante.` }, { status: 409 });
    throw e;
  }

  const cambios: { campo: ChangeLog["campo"]; anterior: string; nuevo: string }[] = [
    { campo: "documento", anterior: actual.documento, nuevo: documento },
    { campo: "nombre", anterior: actual.nombre, nuevo: nombre },
    { campo: "correo", anterior: actual.correo, nuevo: email.email },
    { campo: "ciudad", anterior: actual.ciudad, nuevo: ciudad },
    { campo: "grupo", anterior: actual.grupo ?? "", nuevo: grupo },
    { campo: "estado", anterior: actual.estado, nuevo: b.estado },
  ];
  await logChanges({ _id, documento }, actor, "editar_admin", cambios);

  const updated = await students.findOne({ _id });
  return NextResponse.json({ row: monitorRow(updated!, await correosRepetidos(students)) });
}
