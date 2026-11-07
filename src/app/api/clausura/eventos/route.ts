import { NextResponse } from "next/server";
import { exigir, sameOrigin } from "@/lib/auth";
import { clausura } from "@/lib/clausura/db";
import { mapaDe, modoProyecto, TIPOS_EVENTO, textoFecha, tipoDe } from "@/lib/clausura/evento";
import { crearEvento, datosParaEditar, NuevoEvento } from "@/lib/clausura/gestion";
import { eventosVisibles } from "@/lib/clausura/panel";
import { leerCuerpo } from "@/lib/clausura/rutas";
import { puede } from "@/lib/permisos";

const espacios = (t: string) => t.replace(/[  ]/g, " ");

/**
 * Lista de eventos (monitor: los de sus ciudades, en lectura; coordinación: todos, en lectura; admin: todos y editables).
 * Al admin también le llegan las ciudades que existen en students y los datos para editar.
 */
export async function GET() {
  const g = await exigir("clausura_ver");
  if (g.error) return g.error;
  const { eventos, respuestas, estudiantes } = await clausura();
  const lista = eventosVisibles(await eventos.find({}).sort({ inicio: 1 }).toArray(), g.user);
  const admin = puede(g.user.rol, "clausura_gestionar");
  const enviadas = new Map<string, number>();
  for (const e of lista) enviadas.set(e._id.toHexString(), await respuestas.countDocuments({ eventoId: e._id, estado: "enviada" }));
  const filas = lista.map((e) => {
    const f = textoFecha(e);
    const tipo = tipoDe(e);
    return {
      id: e._id.toHexString(), slug: e.slug, tipo, nombreTipo: TIPOS_EVENTO[tipo].nombre, titulo: e.titulo, nombreVisible: e.nombreVisible,
      ciudades: e.ciudades, dia: f.dia, hora: f.hora, llegada: f.llegada, lugar: e.lugar, direccion: e.direccion, mapa: mapaDe(e), imagen: e.imagen,
      fechaLimite: e.fechaLimite ? espacios(e.fechaLimite.toLocaleString("es-CO", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: e.zonaHoraria })) : null,
      estado: e.estado, permitirEdicion: e.permitirEdicion, proyecto: modoProyecto(e),
      enviadas: enviadas.get(e._id.toHexString()) ?? 0,
      ...(admin ? { datos: datosParaEditar(e) } : {}),
    };
  });
  const ciudades = admin ? ((await estudiantes.distinct("ciudad")) as string[]).sort((a, b) => a.localeCompare(b, "es")) : [];
  return NextResponse.json({ eventos: filas, ciudades, puedeGestionar: admin });
}

/** Crear un evento (solo admin). Las preguntas se copian de otro evento o de la plantilla estándar. Queda en borrador. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "origen" }, { status: 403 });
  const g = await exigir("clausura_gestionar");
  if (g.error) return g.error;
  const leido = await leerCuerpo(req, NuevoEvento);
  if ("error" in leido) return leido.error;
  const r = await crearEvento(leido.datos, g.user.usuario);
  if (!r.ok) return NextResponse.json({ error: "invalido", errores: r.errores }, { status: r.status });
  return NextResponse.json({ id: r.evento._id.toHexString(), slug: r.evento.slug }, { status: 201 });
}
