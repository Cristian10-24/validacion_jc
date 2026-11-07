import { enviar } from "@/lib/clausura/estudiante";
import { conSesion, responder } from "@/lib/clausura/rutas";

/** Enviar (o reenviar una edición). Valida todo el camino en el servidor. */
export async function POST(req: Request) {
  const s = await conSesion(req, true);
  if ("error" in s) return s.error;
  return responder(await enviar(s.ctx));
}
