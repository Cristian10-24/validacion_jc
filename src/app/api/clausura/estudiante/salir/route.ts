import { NextResponse } from "next/server";
import { COOKIE_CLAUSURA, opcionesCookie } from "@/lib/clausura/sesion";

/** "No soy yo": borra la cookie del estudiante. */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_CLAUSURA, "", { ...opcionesCookie, maxAge: 0 });
  return res;
}
