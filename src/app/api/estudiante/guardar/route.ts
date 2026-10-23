import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { collections } from "@/lib/db";
import { logChanges } from "@/lib/history";
import { studentPortalOpen } from "@/lib/portal";
import type { Actor } from "@/lib/types";
import { checkEmail, emailError } from "@/lib/validation/email";
import { cleanSpaces, nameWarnings, normalizeDocumento, toProperName } from "@/lib/validation/name";

const Body = z.object({
  id: z.string().refine(ObjectId.isValid),
  documento: z.string().min(1).max(30),
  accion: z.enum(["confirmar", "corregir"]),
  nombre: z.string().max(150).optional(),
  correo: z.string().max(150).optional(),
  aceptaCorreoPersonal: z.literal(true),
});

const ESTUDIANTE: Actor = { rol: "estudiante" };

export async function POST(req: Request) {
  if (!studentPortalOpen()) return NextResponse.json({ error: "cerrado" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const body = parsed.data;

  const { students } = await collections();
  // Se exige id + documento: el id solo no basta para modificar un registro.
  const student = await students.findOne({ _id: new ObjectId(body.id), documento: normalizeDocumento(body.documento) });
  if (!student) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });
  if (student.estado === "validado") return NextResponse.json({ error: "ya_validado" }, { status: 409 });

  const actualNombre = student.nombrePropuesto ?? student.nombre;
  const actualCorreo = student.correoPropuesto ?? student.correo;
  const nombre = body.accion === "corregir" && body.nombre ? toProperName(body.nombre) : actualNombre;
  const email = checkEmail(body.accion === "corregir" && body.correo ? body.correo : actualCorreo);
  const error = emailError(email);
  if (error) return NextResponse.json({ error: "correo", mensaje: error }, { status: 422 });
  if (nameWarnings(nombre).includes("incompleto") || cleanSpaces(nombre).length < 5)
    return NextResponse.json({ error: "nombre", mensaje: "Escribe tu nombre completo: nombres y apellidos." }, { status: 422 });

  const now = new Date();
  // Sin diferencias con los datos oficiales → validado. Con diferencias → corrección para revisar.
  const cambio = nombre !== student.nombre || email.email !== student.correo;

  if (!cambio) {
    await students.updateOne(
      { _id: student._id },
      {
        $set: { estado: "validado", aceptaCorreoPersonal: true, validadoPor: ESTUDIANTE, validadoEn: now, actualizadoEn: now },
        $unset: { nombrePropuesto: "", correoPropuesto: "" },
      },
    );
    await logChanges(student, ESTUDIANTE, "confirmar", [{ campo: "estado", anterior: student.estado, nuevo: "validado" }]);
    return NextResponse.json({ estado: "validado" });
  }

  await students.updateOne(
    { _id: student._id },
    { $set: { estado: "corregido", nombrePropuesto: nombre, correoPropuesto: email.email, aceptaCorreoPersonal: true, actualizadoEn: now } },
  );
  await logChanges(student, ESTUDIANTE, "corregir", [
    { campo: "nombre", anterior: student.nombrePropuesto ?? student.nombre, nuevo: nombre },
    { campo: "correo", anterior: student.correoPropuesto ?? student.correo, nuevo: email.email },
    { campo: "estado", anterior: student.estado, nuevo: "corregido" },
  ]);
  return NextResponse.json({ estado: "corregido" });
}
