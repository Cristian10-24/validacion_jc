import { NextResponse } from "next/server";
import { conSesion, responderVista } from "@/lib/clausura/rutas";

/** Retoma donde iba, con la cookie (sin volver a escribir el documento). Sin cookie válida: { resultado: "sin_sesion" }. */
export async function GET(req: Request) {
  const s = await conSesion(req, false);
  if ("error" in s) return s.error.status === 401 ? NextResponse.json({ resultado: "sin_sesion" }) : s.error;
  return responderVista(s.ctx);
}
