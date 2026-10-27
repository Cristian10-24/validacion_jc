import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";
import { exigir, sameOrigin } from "@/lib/auth";
import { testimonios } from "@/lib/testimonios/db";
import { alcanceTestimonios } from "@/lib/testimonios/vista";
import { cleanSpaces } from "@/lib/validation/name";

const Body = z.object({ texto: z.string().max(1000) }).strict();

/**
 * Agregar un comentario a un participante (cualquier estado). Queda con fecha y autor.
 * Un participante fuera del alcance del usuario (otra ciudad) responde 404, igual que si no existiera.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("testimonios_comentar");
  if (g.error) return g.error;

  const { id } = await params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "datos_invalidos" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "datos_invalidos", mensaje: "El comentario puede tener hasta 1000 caracteres." }, { status: 400 });
  const texto = parsed.data.texto.replace(/\r\n/g, "\n").split("\n").map(cleanSpaces).join("\n").trim();
  if (!texto) return NextResponse.json({ error: "vacio", mensaje: "Escribe el comentario." }, { status: 400 });

  const { participantes, comentarios } = await testimonios();
  const participante = await participantes.findOne({ _id: new ObjectId(id), ...alcanceTestimonios(g.user) }, { projection: { _id: 1 } });
  if (!participante) return NextResponse.json({ error: "no_encontrado" }, { status: 404 });

  const c = { _id: new ObjectId(), participanteId: participante._id, texto, autor: { usuario: g.user.usuario, nombre: g.user.nombre, rol: g.user.rol }, fecha: new Date() };
  await comentarios.insertOne(c);
  return NextResponse.json({ comentario: { id: c._id.toHexString(), texto: c.texto, autor: c.autor, fecha: c.fecha.toISOString() } }, { status: 201 });
}
