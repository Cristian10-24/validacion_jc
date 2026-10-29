// Validación del texto de un comentario: la misma al crearlo y al editarlo.
import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanSpaces } from "@/lib/validation/name";

export const MAX_COMENTARIO = 1000;
const Body = z.object({ texto: z.string().max(MAX_COMENTARIO) }).strict();

/** Lee { texto } del cuerpo: espacios limpios por línea, sin vacío y hasta 1000 caracteres. Devuelve el texto o la respuesta 400. */
export async function leerTextoComentario(req: Request): Promise<{ texto: string } | { error: NextResponse }> {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return { error: NextResponse.json({ error: "datos_invalidos", mensaje: `El comentario puede tener hasta ${MAX_COMENTARIO} caracteres.` }, { status: 400 }) };
  const texto = parsed.data.texto.replace(/\r\n/g, "\n").split("\n").map(cleanSpaces).join("\n").trim();
  if (!texto) return { error: NextResponse.json({ error: "vacio", mensaje: "Escribe el comentario." }, { status: 400 }) };
  return { texto };
}
