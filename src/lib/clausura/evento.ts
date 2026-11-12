// Evento de clausura: formato de los archivos eventos/<ciudad>.json (el mismo que guardará el editor),
// reglas de apertura y la vista pública que recibe el estudiante.
import { z } from "zod";
import type { Evento, EstadoEvento } from "./db";
import { enlaceGoogle } from "./calendario";
import { Formulario, ID, type Respuestas } from "./formulario/esquema";
import { preguntasDe } from "./formulario/motor";
import { aplicarAcompanante, MODOS_ACOMPANANTE, type ModoAcompanante } from "./formulario/acompanante";
import { aplicarProyecto, MODOS_PROYECTO, type ModoProyecto } from "./formulario/proyecto";
import { reemplazar, resolverTextos, type Variables } from "./formulario/variables";
import { sinMarcadores, textoQuedan } from "./presentacion";

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
export const mismaCiudad = (a: string, b: string) => fold(a) === fold(b);

/** Zonas horarias que ofrece el editor (cualquier IANA válida también sirve en el JSON). */
export const ZONAS: Record<string, string> = {
  "America/Bogota": "hora de Colombia",
  "America/Panama": "hora de Panamá",
  "America/Guayaquil": "hora de Ecuador",
  "America/Montevideo": "hora de Uruguay",
};

const zonaValida = (tz: string) => { try { new Intl.DateTimeFormat("es", { timeZone: tz }); return true; } catch { return false; } };
const FechaHora = z.iso.datetime({ offset: true, message: "Fecha con hora y zona, p. ej. 2026-11-28T16:00:00-05:00" });
const Ruta = z.string().regex(/^\/[A-Za-z0-9/_.-]+$/, "Ruta del sitio, p. ej. /clausura/cali.webp");

/** Marca de dato pendiente en los JSON. Con algún dato así, el script no deja abrir el evento. */
export const POR_DEFINIR = "[POR DEFINIR]";
const PorDefinir = z.string().max(80).refine((s) => s.includes(POR_DEFINIR), `Fecha con hora y zona (p. ej. 2026-11-28T16:00:00-05:00) o "${POR_DEFINIR}"`);

/** Tipos de evento: cómo se nombra en títulos ("nombre") y dentro de una frase ("Asistiré a la {evento}"). */
export const TIPOS_EVENTO = {
  expoferia: { nombre: "EXPOFeria y clausura", frase: "EXPOFeria y clausura", kicker: "EXPOFERIA" },
  clausura: { nombre: "Clausura", frase: "clausura", kicker: "CLAUSURA" },
} as const;
export type TipoEvento = keyof typeof TIPOS_EVENTO;

/** Rutas fijas bajo /clausura que no pueden ser slugs de eventos. */
export const SLUGS_RESERVADOS = ["panel", "resumen", "eventos", "admin", "api", "estudiante"];

/** Formato del archivo JSON de un evento. */
export const EventoArchivo = z.object({
  $comentario: z.unknown().optional(),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug usa minúsculas, números y guiones (p. ej. cali-2026)").max(60)
    .refine((s) => !SLUGS_RESERVADOS.includes(s), "Ese slug está reservado para el panel"),
  /** "expoferia" = clausura + presentación de proyectos · "clausura" = solo la ceremonia de certificados. */
  tipo: z.enum(["expoferia", "clausura"]),
  /** Si faltan, se arman con el tipo y el año: "EXPOFeria y clausura 2026" / "EXPOFERIA 2026". */
  titulo: z.string().min(1).max(120).optional(),
  kicker: z.string().min(1).max(40).optional(),
  nombreVisible: z.string().min(1).max(60),
  ciudades: z.array(z.string().min(1).max(60)).min(1).max(20),
  descripcion: z.string().max(5000).default(""),
  lugar: z.string().min(1).max(150),
  direccion: z.string().min(1).max(200),
  mapaUrl: z.url({ protocol: /^https$/ }).nullable().optional(),
  inicio: z.union([FechaHora, PorDefinir]),
  fin: z.union([FechaHora, PorDefinir]).nullable().optional(),
  /** Hora de citación (llegada), antes del inicio: "se citan a las 8:30". Es la hora que va en el calendario. */
  citacion: z.union([FechaHora, PorDefinir]).nullable().optional(),
  zonaHoraria: z.string().refine(zonaValida, "Zona horaria IANA, p. ej. America/Bogota"),
  zonaHorariaTexto: z.string().max(40).nullable().optional(),
  imagen: Ruta.nullable().optional(),
  estado: z.enum(["borrador", "abierto", "cerrado"]).default("borrador"),
  fechaLimite: z.union([FechaHora, PorDefinir]).nullable().optional(),
  /** Por defecto NO se edita después de enviar. Solo el admin lo cambia (--permitir-edicion=si) o reabre a un estudiante. */
  permitirEdicion: z.boolean().default(false),
  preguntaAsistencia: ID.nullable().optional(),
  /** Opciones de la pregunta de asistencia que cuentan como "asistirá" (muestran el calendario). */
  opcionesAsisten: z.array(ID).max(20).default([]),
  /** Sección del proyecto: "obligatorio" (aparece y se exige), "opcional" (pregunta Sí/No antes) o "no". */
  proyecto: z.enum(MODOS_PROYECTO).default("no"),
  /** ¿Pueden llevar acompañante? "si" (la sección de acompañante aparece) o "no" (no aparece). Sin el campo: "si". */
  acompanante: z.enum(MODOS_ACOMPANANTE).default("si"),
  formulario: Formulario,
}).strict();
export type EventoArchivo = z.infer<typeof EventoArchivo>;

/** Rutas (p. ej. "lugar", "inicio") de los textos que todavía dicen [POR DEFINIR]. */
export function pendientesDe(valor: unknown, ruta = ""): string[] {
  if (typeof valor === "string") return valor.includes(POR_DEFINIR) ? [ruta || "(raíz)"] : [];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => pendientesDe(v, ruta ? `${ruta}.${i}` : String(i)));
  if (valor && typeof valor === "object") {
    return Object.entries(valor).filter(([k]) => k !== "$comentario").flatMap(([k, v]) => pendientesDe(v, ruta ? `${ruta}.${k}` : k));
  }
  return [];
}

/**
 * SOLO PARA PRUEBAS LOCALES: completa los [POR DEFINIR] con valores de ejemplo para poder abrir el evento en la semilla.
 * Fechas "AAAA-MM-DDT[POR DEFINIR]" → ese día a las 9:00 (fin: 12:00); fechaLimite → 2 días antes del inicio.
 */
export function completarEjemplo(e: Record<string, unknown>): Record<string, unknown> {
  const offset = String(e.zonaHoraria ?? "").includes("Montevideo") ? "-03:00" : "-05:00";
  const fecha = (v: unknown, hora: string, base?: string) => {
    if (typeof v !== "string" || !v.includes(POR_DEFINIR)) return v;
    const dia = /^(\d{4}-\d{2}-\d{2})/.exec(v)?.[1] ?? base?.slice(0, 10) ?? "2026-12-01";
    return `${dia}T${hora}:00${offset}`;
  };
  const inicio = fecha(e.inicio, "09:00") as string;
  const limite = new Date(Date.parse(inicio) - 2 * 864e5).toISOString().slice(0, 10);
  const fechaLimite = typeof e.fechaLimite === "string" && e.fechaLimite.includes(POR_DEFINIR) ? `${limite}T23:59:00${offset}` : e.fechaLimite;
  const textos = (v: unknown): unknown => typeof v === "string" ? v.replaceAll(POR_DEFINIR, "(dato de ejemplo)")
    : Array.isArray(v) ? v.map(textos) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, textos(x)])) : v;
  return textos({ ...e, inicio, fin: fecha(e.fin, "12:00", inicio), fechaLimite }) as Record<string, unknown>;
}

/** Problemas de un evento que no detecta el esquema (fechas, pregunta de asistencia). */
export function revisarEventoArchivo(e: EventoArchivo): string[] {
  const errores: string[] = [];
  const fecha = (v: string | null | undefined) => (v && !v.includes(POR_DEFINIR) ? Date.parse(v) : null);
  const ini = fecha(e.inicio), fin = fecha(e.fin), lim = fecha(e.fechaLimite), cit = fecha(e.citacion);
  if (ini !== null && cit !== null && cit > ini) errores.push("citacion (hora de llegada) debe ser antes o igual al inicio");
  if (lim !== null && cit !== null && lim > cit) errores.push("fechaLimite debe ser antes de la hora de llegada");
  if (ini !== null && fin !== null && fin <= ini) errores.push("fin debe ser después de inicio");
  if (ini !== null && lim !== null && lim > ini) errores.push("fechaLimite debe ser antes del inicio del evento");
  if (e.preguntaAsistencia) {
    const p = preguntasDe(e.formulario).get(e.preguntaAsistencia);
    if (p && e.formulario.secciones.find((s) => s.items.includes(p))?.proyecto) errores.push("preguntaAsistencia no puede estar en la sección del proyecto");
    if (!p) errores.push(`preguntaAsistencia: "${e.preguntaAsistencia}" no existe en el formulario`);
    else if (!["unica", "desplegable", "sino"].includes(p.tipo)) errores.push("preguntaAsistencia debe ser de opción única, desplegable o sí/no");
    else {
      const ids = p.tipo === "sino" ? ["si", "no"] : (p.opciones ?? []).map((o) => o.id);
      for (const o of e.opcionesAsisten) if (!ids.includes(o)) errores.push(`opcionesAsisten: "${o}" no es una opción de "${p.id}"`);
    }
  } else if (e.opcionesAsisten.length) errores.push("opcionesAsisten necesita preguntaAsistencia");
  if (e.proyecto !== "no" && !e.formulario.secciones.some((s) => s.proyecto)) errores.push(`proyecto "${e.proyecto}" necesita una sección con "proyecto": true`);
  return errores;
}

/** Campos del documento (sin _id, versión ni marcas de tiempo). Lanza error si una fecha sigue [POR DEFINIR]. */
export function datosDesdeArchivo(e: EventoArchivo) {
  const fecha = (v: string | null | undefined, campo: string) => {
    if (!v) return null;
    if (v.includes(POR_DEFINIR)) throw new Error(`${campo} está ${POR_DEFINIR}`);
    return new Date(v);
  };
  const anio = String(e.inicio).slice(0, 4);
  const tipo = TIPOS_EVENTO[e.tipo];
  return {
    slug: e.slug, tipo: e.tipo, titulo: e.titulo ?? `${tipo.nombre} ${anio}`, kicker: e.kicker ?? `${tipo.kicker} ${anio}`,
    nombreVisible: e.nombreVisible, ciudades: e.ciudades,
    descripcion: e.descripcion, lugar: e.lugar, direccion: e.direccion, mapaUrl: e.mapaUrl ?? null,
    inicio: fecha(e.inicio, "inicio")!, fin: fecha(e.fin, "fin"), citacion: fecha(e.citacion, "citacion"), zonaHoraria: e.zonaHoraria, zonaHorariaTexto: e.zonaHorariaTexto ?? null,
    imagen: e.imagen ?? null, estado: e.estado as EstadoEvento, fechaLimite: fecha(e.fechaLimite, "fechaLimite"),
    permitirEdicion: e.permitirEdicion, preguntaAsistencia: e.preguntaAsistencia ?? null, opcionesAsisten: e.opcionesAsisten, proyecto: e.proyecto, acompanante: e.acompanante, formulario: e.formulario,
  };
}

/** ¿Se aceptan respuestas nuevas o cambios? Abierto y antes de la fecha límite. */
export function aceptaRespuestas(e: Pick<Evento, "estado" | "fechaLimite">, ahora = new Date()): boolean {
  return e.estado === "abierto" && (!e.fechaLimite || ahora < e.fechaLimite);
}

/**
 * Evento de la ciudad del estudiante: el abierto (si hay varios, el más próximo); si no hay abierto, el cerrado más
 * reciente (para que quien ya respondió vea sus respuestas). Los borradores nunca.
 */
export function eventoParaCiudad<T extends Pick<Evento, "estado" | "ciudades" | "inicio">>(eventos: T[], ciudad: string): T | null {
  const suyos = eventos.filter((e) => e.estado !== "borrador" && e.ciudades.some((c) => mismaCiudad(c, ciudad)));
  const abiertos = suyos.filter((e) => e.estado === "abierto").sort((a, b) => +a.inicio - +b.inicio);
  if (abiertos.length) return abiertos[0]!;
  return suyos.sort((a, b) => +b.inicio - +a.inicio)[0] ?? null;
}

export function mapaDe(e: Pick<Evento, "mapaUrl" | "lugar" | "direccion" | "nombreVisible">): string {
  return e.mapaUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${e.lugar}, ${e.direccion}, ${e.nombreVisible}`)}`;
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** Intl usa espacios especiales en "a. m."; se cambian por espacios normales (para textos y el calendario). */
const espacios = (t: string) => t.replace(/[\u00a0\u202f]/g, " ");

export const horaDe = (d: Date, tz: string) => espacios(d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz }));
/** "sábado 14 de noviembre" (en minúscula, para usar dentro de una frase). */
export const diaDe = (d: Date, tz: string) => espacios(d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).replace(",", ""));

/** "Sábado 28 de noviembre" · "4:00 p. m. – 7:00 p. m. (hora de Colombia)" en la zona del evento. */
export function textoFecha(e: Pick<Evento, "inicio" | "fin" | "zonaHoraria" | "zonaHorariaTexto" | "citacion">): { dia: string; hora: string; llegada: string | null } {
  const tz = e.zonaHoraria;
  const zona = e.zonaHorariaTexto || ZONAS[tz] || tz;
  return {
    dia: cap(diaDe(e.inicio, tz)),
    hora: `${horaDe(e.inicio, tz)}${e.fin ? ` – ${horaDe(e.fin, tz)}` : ""} (${zona})`,
    llegada: e.citacion ? horaDe(e.citacion, tz) : null,
  };
}

/** Tipo del evento (los eventos guardados antes de que existiera el campo cuentan como "clausura"). */
export const tipoDe = (e: Pick<Evento, "tipo">): TipoEvento => (e.tipo === "expoferia" ? "expoferia" : "clausura");

/** Valores de {evento}, {fecha}, {hora} y {lugar} en los textos del formulario. */
export function variablesDe(e: Pick<Evento, "tipo" | "inicio" | "zonaHoraria" | "lugar" | "citacion">): Variables {
  return {
    evento: TIPOS_EVENTO[tipoDe(e)].frase, fecha: diaDe(e.inicio, e.zonaHoraria), hora: horaDe(e.inicio, e.zonaHoraria),
    llegada: horaDe(e.citacion ?? e.inicio, e.zonaHoraria), lugar: e.lugar,
  };
}

/** Modo del proyecto (los eventos sin el campo cuentan como "no"). */
export const modoProyecto = (e: Pick<Evento, "proyecto">): ModoProyecto => e.proyecto ?? "no";

/** ¿Pueden llevar acompañante? (los eventos sin el campo cuentan como "si", como antes). */
export const modoAcompanante = (e: Pick<Evento, "acompanante">): ModoAcompanante => e.acompanante ?? "si";

/**
 * Formulario que se responde de verdad: el guardado + la regla del proyecto y la del acompañante del evento.
 * El servidor valida con este.
 */
export const formularioActivo = (e: Pick<Evento, "proyecto" | "acompanante">, f: Formulario) =>
  aplicarAcompanante(aplicarProyecto(f, modoProyecto(e)), modoAcompanante(e));

/** Formulario con los textos ya resueltos para este evento. */
export const formularioDe = (e: Pick<Evento, "tipo" | "inicio" | "zonaHoraria" | "lugar" | "citacion">, f: Formulario) => resolverTextos(f, variablesDe(e));

/** ¿Con estas respuestas el estudiante asistirá? (opciones "asisten" de la pregunta de asistencia). */
export function asistira(e: Pick<Evento, "preguntaAsistencia" | "opcionesAsisten">, r: Respuestas): boolean {
  const v = e.preguntaAsistencia ? r[e.preguntaAsistencia] : undefined;
  return typeof v === "string" && (e.opcionesAsisten ?? []).includes(v);
}

/** Lo que ve el estudiante del evento (sin ciudades internas ni datos de gestión). */
export function eventoVista(e: Evento, ahora = new Date()) {
  const f = textoFecha(e);
  const tipo = tipoDe(e);
  return {
    id: e._id.toHexString(), slug: e.slug, tipo, nombreTipo: TIPOS_EVENTO[tipo].nombre, fraseTipo: TIPOS_EVENTO[tipo].frase,
    titulo: e.titulo, kicker: e.kicker, nombreVisible: e.nombreVisible,
    descripcion: reemplazar(e.descripcion, variablesDe(e)), lugar: e.lugar, direccion: e.direccion, mapa: mapaDe(e), imagen: e.imagen,
    dia: f.dia, hora: f.hora, llegada: f.llegada, estado: e.estado, aceptaRespuestas: aceptaRespuestas(e, ahora), permitirEdicion: e.permitirEdicion,
    fechaLimite: e.fechaLimite ? espacios(e.fechaLimite.toLocaleString("es-CO", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: e.zonaHoraria })) : null,
    preguntaAsistencia: e.preguntaAsistencia, opcionesAsisten: e.opcionesAsisten ?? [],
    calendario: { ics: `/api/clausura/calendario/${e.slug}`, google: enlaceGoogle(e) },
    proyecto: modoProyecto(e),
    acompanante: modoAcompanante(e),
    portada: presentacionDe(e, ahora),
    formulario: formularioDe(e, formularioActivo(e, e.formulario)),
  };
}
export type EventoVista = ReturnType<typeof eventoVista>;

/**
 * Textos de la portada pública (solo presentación, derivados de los datos del evento). Todo lo que tenga un
 * marcador "[…]" sale como null y la línea no se muestra.
 */
export function presentacionDe(e: Evento, ahora = new Date()) {
  const tz = e.zonaHoraria;
  const tipo = TIPOS_EVENTO[tipoDe(e)];
  const anio = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(e.inicio);
  const mes = espacios(e.inicio.toLocaleDateString("es-CO", { month: "short", timeZone: tz })).replace(".", "");
  const dia = e.inicio.toLocaleDateString("es-CO", { day: "numeric", timeZone: tz });
  const semana = cap(e.inicio.toLocaleDateString("es-CO", { weekday: "long", timeZone: tz }));
  return {
    /** "EXPOFERIA Y CLAUSURA" · "CLAUSURA" */
    etiquetaTipo: tipo.nombre.toUpperCase(),
    /** "CLAUSURA · CARTAGENA" */
    etiquetaCiudad: sinMarcadores(`${tipo.nombre} · ${e.nombreVisible}`.toUpperCase()),
    /** "Clausura Jóvenes creaTIvos 2026 – Cartagena" */
    invitacion: sinMarcadores(`${tipo.nombre} Jóvenes creaTIvos ${anio} – ${e.nombreVisible}`),
    /** "3:00 p. m. – 5:00 p. m." (sin la zona) */
    horaRango: sinMarcadores(`${horaDe(e.inicio, tz)}${e.fin ? ` – ${horaDe(e.fin, tz)}` : ""}`),
    horaInicio: horaDe(e.inicio, tz),
    /** "Hora de Colombia" */
    zonaTexto: cap(e.zonaHorariaTexto || ZONAS[tz] || tz),
    /** "Jueves 19 nov" */
    diaCorto: `${semana} ${dia} ${mes}`,
    /** "Lunes 9 de noviembre" (fecha límite, en la zona del evento) */
    limiteDia: e.fechaLimite ? cap(diaDe(e.fechaLimite, tz)) : null,
    /** "Quedan 3 días" · "Último día" · null si no hay fecha límite o ya cerró */
    quedan: textoQuedan(e.fechaLimite, tz, ahora),
    lugar: sinMarcadores(e.lugar),
    direccion: sinMarcadores(e.direccion),
    zona: tz,
  };
}
export type PresentacionEvento = ReturnType<typeof presentacionDe>;
