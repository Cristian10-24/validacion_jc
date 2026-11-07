import { z } from "zod";
import { edicion } from "@/lib/clausura/estudiante";
import { conSesion, leerCuerpo, responder } from "@/lib/clausura/rutas";

const Body = z.object({ accion: z.enum(["empezar", "cancelar"]) }).strict();

/** Empezar o cancelar la edición de una respuesta ya enviada (lo enviado no cambia hasta volver a enviar). */
export async function POST(req: Request) {
  const s = await conSesion(req, true);
  if ("error" in s) return s.error;
  const leido = await leerCuerpo(req, Body);
  if ("error" in leido) return leido.error;
  return responder(await edicion(s.ctx, leido.datos.accion));
}
