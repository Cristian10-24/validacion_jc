import { ContactoBody, guardarContacto } from "@/lib/clausura/estudiante";
import { conSesion, leerCuerpo, responder } from "@/lib/clausura/rutas";

/** Sección 0: confirma o cambia el correo (solo en clausura_respuestas), el celular y el WhatsApp. */
export async function PUT(req: Request) {
  const s = await conSesion(req, true);
  if ("error" in s) return s.error;
  const leido = await leerCuerpo(req, ContactoBody);
  if ("error" in leido) return leido.error;
  return responder(await guardarContacto(s.ctx, leido.datos));
}
