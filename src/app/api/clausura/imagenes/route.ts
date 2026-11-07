import { Binary, ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { clausura } from "@/lib/clausura/db";

const MAX_IMAGEN = 600 * 1024;

/** Tipo real por los primeros bytes (no se confía en la extensión ni en el Content-Type). */
function tipoReal(b: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Subir una portada (solo admin). El navegador ya la redimensionó y comprimió; aquí se revisan tipo y tamaño. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("clausura_gestionar");
  if (g.error) return g.error;
  const mensaje = "La imagen pesa demasiado (máximo 600 KB).";
  if (Number(req.headers.get("content-length") ?? 0) > MAX_IMAGEN) return NextResponse.json({ error: "muy_grande", mensaje }, { status: 413 });
  const datos = Buffer.from(await req.arrayBuffer());
  if (datos.length > MAX_IMAGEN) return NextResponse.json({ error: "muy_grande", mensaje }, { status: 413 });
  const tipo = tipoReal(datos);
  if (!tipo) return NextResponse.json({ error: "tipo", mensaje: "Sube una imagen JPG, PNG o WebP." }, { status: 400 });
  const { imagenes } = await clausura();
  const _id = new ObjectId();
  await imagenes.insertOne({ _id, tipo, datos: new Binary(datos), bytes: datos.length, subidaPor: g.user.usuario, subidaEn: new Date() });
  return NextResponse.json({ ruta: `/api/clausura/imagenes/${_id.toHexString()}` }, { status: 201 });
}
