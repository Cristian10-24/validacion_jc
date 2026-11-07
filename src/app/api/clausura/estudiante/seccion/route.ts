import { guardarSeccion, SeccionBody } from "@/lib/clausura/estudiante";
import { conSesion, leerCuerpo, responder } from "@/lib/clausura/rutas";

/** Autoguardado al pasar de sección. El servidor recalcula el camino y descarta lo de ramas ocultas. */
export async function PUT(req: Request) {
  const s = await conSesion(req, true);
  if ("error" in s) return s.error;
  const leido = await leerCuerpo(req, SeccionBody);
  if ("error" in leido) return leido.error;
  return responder(await guardarSeccion(s.ctx, leido.datos));
}
