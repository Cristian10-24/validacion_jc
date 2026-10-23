import { NextResponse } from "next/server";
import { z } from "zod";
import { collections } from "@/lib/db";
import { studentPortalOpen } from "@/lib/portal";
import { studentView } from "@/lib/student-view";
import { normalizeDocumento } from "@/lib/validation/name";

const Body = z.object({ documento: z.string().min(1).max(30) });

export async function POST(req: Request) {
  if (!studentPortalOpen()) return NextResponse.json({ error: "cerrado" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });

  const documento = normalizeDocumento(parsed.data.documento);
  const { students } = await collections();
  const student = documento ? await students.findOne({ documento }) : null;
  if (!student) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  if (student.estado === "validado")
    return NextResponse.json({ estado: "validado", nombre: student.nombre, correo: student.correo, validadoEn: student.validadoEn ?? null });
  return NextResponse.json(studentView(student));
}
