import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser, sameOrigin, scopeFilter } from "@/lib/auth";
import { collections } from "@/lib/db";
import { logChanges } from "@/lib/history";
import { correosRepetidos, monitorRow } from "@/lib/monitor-view";
import type { Actor } from "@/lib/types";
import { checkEmail, emailError } from "@/lib/validation/email";
import { nameWarnings, toProperName } from "@/lib/validation/name";

const Body = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("aprobar") }),
  z.object({ accion: z.literal("editar"), nombre: z.string().max(150), correo: z.string().max(150) }),
  z.object({ accion: z.literal("validar_en_nombre"), nombre: z.string().max(150), correo: z.string().max(150), confirmado: z.literal(true) }),
]);

/** Historial de cambios de un estudiante (solo admin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sesion" }, { status: 401 });
  if (user.rol !== "admin") return NextResponse.json({ error: "solo_admin" }, { status: 403 });
  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

  const { changeLog } = await collections();
  const items = await changeLog.find({ studentId: new ObjectId(id) }, { projection: { _id: 0, studentId: 0, documento: 0 } }).sort({ fecha: -1 }).limit(200).toArray();
  return NextResponse.json({ historial: items.map((h) => ({ ...h, fecha: h.fecha.toISOString() })) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sesion" }, { status: 401 });

  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!ObjectId.isValid(id) || !parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const body = parsed.data;

  const { students } = await collections();
  // El filtro de ciudad va en la consulta: un estudiante de otra ciudad simplemente "no existe".
  const filter = { _id: new ObjectId(id), ...scopeFilter(user) };
  const student = await students.findOne(filter);
  if (!student) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  let nombre: string, correo: string;
  if (body.accion === "aprobar") {
    if (student.estado !== "corregido") return NextResponse.json({ error: "nada_que_aprobar" }, { status: 409 });
    nombre = student.nombrePropuesto ?? student.nombre;
    correo = student.correoPropuesto ?? student.correo;
  } else {
    nombre = toProperName(body.nombre);
    const check = checkEmail(body.correo);
    const error = emailError(check);
    if (error) return NextResponse.json({ error: "correo", mensaje: error }, { status: 422 });
    if (nameWarnings(nombre).includes("incompleto"))
      return NextResponse.json({ error: "nombre", mensaje: "Escribe el nombre completo: nombres y apellidos." }, { status: 422 });
    correo = check.email;
  }

  const actor: Actor = { rol: user.rol, usuario: user.usuario };
  const now = new Date();
  await students.updateOne(filter, {
    $set: { nombre, correo, correoNorm: correo, estado: "validado", validadoPor: actor, validadoEn: now, actualizadoEn: now },
    $unset: { nombrePropuesto: "", correoPropuesto: "" },
  });
  await logChanges(student, actor, body.accion, [
    { campo: "nombre", anterior: student.nombre, nuevo: nombre },
    { campo: "correo", anterior: student.correo, nuevo: correo },
    { campo: "estado", anterior: student.estado, nuevo: "validado" },
  ]);

  const updated = await students.findOne(filter);
  return NextResponse.json({ row: monitorRow(updated!, await correosRepetidos(students)) });
}
