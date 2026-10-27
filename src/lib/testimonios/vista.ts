// Lectura de la vista "Testimonios" según el usuario. Solo LEE colecciones testimonios_*.
// El alcance por ciudad se valida en el servidor: un monitor solo ve participantes de sus ciudades.
import type { Filter } from "mongodb";
import type { SessionUser } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { testimonios, type Participante } from "./db";
import { estadoDe, parseMarcaTemporal, type EstadoTestimonio } from "./estado";

/** Filtro obligatorio de participantes según el rol (mismo criterio que scopeFilter de estudiantes). */
export function alcanceTestimonios(user: Pick<SessionUser, "rol" | "ciudades">): Filter<Participante> {
  return puede(user.rol, "ver_todas_las_ciudades") ? {} : { ciudad: { $in: user.ciudades } };
}

export type EnvioVista = { id: string; marcaTemporal: string; fecha: string | null; recibidaEn: string; enlaces: string[]; cruzadoPor: string | null };
export type ComentarioVista = { id: string; texto: string; autor: { nombre: string; usuario: string; rol: string }; fecha: string };
export type FilaTestimonio = {
  id: string;
  nombre: string;
  documento: string;
  ciudad: string;
  ciudadOriginal: string | null;
  celular: string;
  correo: string;
  estado: EstadoTestimonio;
  envios: EnvioVista[];          // el más reciente primero
  comentarios: ComentarioVista[]; // en orden cronológico
  ultimoEnvio: number | null;
  ultimoComentario: number | null;
};

export async function filasTestimonios(user: Pick<SessionUser, "rol" | "ciudades">): Promise<FilaTestimonio[]> {
  const { participantes, respuestas, comentarios } = await testimonios();
  const lista = await participantes.find(alcanceTestimonios(user)).toArray();
  const ids = lista.map((p) => p._id);
  const [envios, notas] = await Promise.all([
    respuestas.find({ participanteId: { $in: ids }, cruce: { $in: ["auto", "manual"] } }, { projection: { participanteId: 1, marcaTemporal: 1, recibidaEn: 1, enlaces: 1, cruzadoPor: 1 } }).toArray(),
    comentarios.find({ participanteId: { $in: ids } }).sort({ fecha: 1 }).toArray(),
  ]);

  const enviosDe = new Map<string, EnvioVista[]>();
  for (const r of envios) {
    const k = r.participanteId!.toHexString();
    const ms = parseMarcaTemporal(r.marcaTemporal) ?? r.recibidaEn.getTime();
    const e: EnvioVista = { id: r._id.toHexString(), marcaTemporal: r.marcaTemporal, fecha: new Date(ms).toISOString(), recibidaEn: r.recibidaEn.toISOString(), enlaces: r.enlaces, cruzadoPor: r.cruzadoPor ?? null };
    enviosDe.set(k, [...(enviosDe.get(k) ?? []), e]);
  }
  const notasDe = new Map<string, ComentarioVista[]>();
  for (const c of notas) {
    const k = c.participanteId.toHexString();
    notasDe.set(k, [...(notasDe.get(k) ?? []), { id: c._id.toHexString(), texto: c.texto, autor: c.autor, fecha: c.fecha.toISOString() }]);
  }

  return lista.map((p) => {
    const k = p._id.toHexString();
    const ev = (enviosDe.get(k) ?? []).sort((a, b) => Date.parse(b.fecha ?? b.recibidaEn) - Date.parse(a.fecha ?? a.recibidaEn));
    const cm = notasDe.get(k) ?? [];
    return {
      id: k, nombre: p.nombre, documento: p.documento, ciudad: p.ciudad, ciudadOriginal: p.ciudadOriginal ?? null,
      celular: p.celular, correo: p.correo, estado: estadoDe(ev.length, cm.length), envios: ev, comentarios: cm,
      ultimoEnvio: ev[0] ? Date.parse(ev[0].fecha ?? ev[0].recibidaEn) : null,
      ultimoComentario: cm.length ? Date.parse(cm[cm.length - 1].fecha) : null,
    };
  });
}
