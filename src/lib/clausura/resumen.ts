// Avance de la clausura por ciudad: cuántos respondieron de cuántos y qué respondieron en asistencia. Solo LEE.
// Monitor: solo sus ciudades; coordinación y admin: todas (el filtro va en la consulta).
import type { SessionUser } from "@/lib/auth";
import { clausura } from "./db";
import { formularioActivo, formularioDe, modoProyecto } from "./evento";
import { preguntasDe } from "./formulario/motor";
import { textoRespuesta } from "./formulario/mostrar";
import { claveOtro } from "./formulario/esquema";
import { alcanceEvento, eventosVisibles, proyectoDe } from "./panel";

export type CiudadClausura = {
  ciudad: string;
  evento: { id: string; slug: string; titulo: string; nombreVisible: string; estado: string };
  total: number;
  respondio: number;
  enProgreso: number;
  sinResponder: number;
  asistencia: { id: string; texto: string; n: number }[];
  presentanProyecto: number | null;
};

export async function resumenClausura(user: Pick<SessionUser, "rol" | "ciudades">) {
  const { eventos, estudiantes, respuestas } = await clausura();
  const lista = eventosVisibles(await eventos.find({ estado: { $ne: "borrador" } }).sort({ inicio: 1 }).toArray(), user);
  const ciudades: CiudadClausura[] = [];
  for (const e of lista) {
    const f = formularioDe(e, formularioActivo(e, e.formulario));
    const pa = e.preguntaAsistencia ? preguntasDe(f).get(e.preguntaAsistencia) : undefined;
    const alumnos = await estudiantes.find(alcanceEvento(e, user), { projection: { ciudad: 1 } }).toArray();
    const resp = await respuestas.find({ eventoId: e._id, studentId: { $in: alumnos.map((a) => a._id) } }).toArray();
    const porAlumno = new Map(resp.map((r) => [r.studentId.toHexString(), r]));
    for (const ciudad of [...new Set(alumnos.map((a) => a.ciudad))].sort((a, b) => a.localeCompare(b, "es"))) {
      const deCiudad = alumnos.filter((a) => a.ciudad === ciudad).map((a) => porAlumno.get(a._id.toHexString()));
      const opciones = pa ? (pa.tipo === "sino" ? [{ id: "si", texto: "Sí" }, { id: "no", texto: "No" }] : (pa.opciones ?? []).filter((o) => !o.archivada)) : [];
      const enviadas = deCiudad.filter((r) => r?.estado === "enviada");
      ciudades.push({
        ciudad,
        evento: { id: e._id.toHexString(), slug: e.slug, titulo: e.titulo, nombreVisible: e.nombreVisible, estado: e.estado },
        total: deCiudad.length,
        respondio: enviadas.length,
        enProgreso: deCiudad.filter((r) => r?.estado === "en_progreso").length,
        sinResponder: deCiudad.filter((r) => !r).length,
        asistencia: pa ? opciones.map((o) => ({ id: o.id, texto: textoRespuesta(pa, o.id, enviadas.find((r) => r?.respuestas[pa.id] === o.id)?.respuestas[claveOtro(pa.id)]), n: enviadas.filter((r) => r!.respuestas[pa.id] === o.id).length })) : [],
        presentanProyecto: modoProyecto(e) === "no" ? null : enviadas.filter((r) => proyectoDe(e, f, r!)?.presenta).length,
      });
    }
  }
  const suma = (k: "total" | "respondio" | "enProgreso" | "sinResponder") => ciudades.reduce((n, c) => n + c[k], 0);
  return {
    total: { total: suma("total"), respondio: suma("respondio"), enProgreso: suma("enProgreso"), sinResponder: suma("sinResponder") },
    ciudades,
    actualizado: new Date().toISOString(),
  };
}
export type ResumenClausura = Awaited<ReturnType<typeof resumenClausura>>;
