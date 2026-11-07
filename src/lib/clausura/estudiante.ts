// Lógica del portal de clausura para el estudiante: ingreso, contacto, autoguardado por sección, envío y edición.
// Solo ESCRIBE en clausura_respuestas. students y testimonios_participantes se leen.
// Regla: el correo y el celular completos NUNCA salen en las respuestas al estudiante (solo ocultos).
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { Student } from "@/lib/types";
import { checkEmail, emailError } from "@/lib/validation/email";
import { normalizeDocumento } from "@/lib/validation/name";
import { GENEROS, ocultarCelular, ocultarCorreo, validarTelefono } from "./contacto";
import { clausura, type Contacto, type Evento, type RespuestaClausura } from "./db";
import { aceptaRespuestas, asistira, eventoParaCiudad, eventoVista, formularioActivo } from "./evento";
import { claveOtro, esPregunta, type Respuestas } from "./formulario/esquema";
import { camino, siguienteSeccion, validarRespuestas } from "./formulario/motor";
import type { SesionClausura } from "./sesion";

const PROYECCION = { documento: 1, ciudad: 1, grupo: 1, nombre: 1, nombrePropuesto: 1, correo: 1, correoPropuesto: 1, estado: 1 } as const;
export type EstudianteLeido = Pick<Student, "_id" | "documento" | "ciudad" | "grupo" | "nombre" | "nombrePropuesto" | "correo" | "correoPropuesto" | "estado">;

export type Contexto = { student: EstudianteLeido; evento: Evento; respuesta: RespuestaClausura | null; celularMostrado: string | null };

/** Nombre y correo con los que se le habla: si corrigió y aún no se aprueba, lo propuesto. */
const nombreDe = (s: EstudianteLeido) => s.nombrePropuesto ?? s.nombre;
const correoDe = (s: EstudianteLeido) => s.correoPropuesto ?? s.correo;

async function celularDe(documento: string): Promise<string | null> {
  const { participantes } = await clausura();
  const p = await participantes.findOne({ documento }, { projection: { celular: 1 } });
  return p?.celular ? String(p.celular) : null;
}

export type ResultadoIngreso =
  | { tipo: "no_encontrado" }
  | { tipo: "pronto" }
  | { tipo: "ok"; ctx: Contexto };

/** Busca al estudiante por documento y el evento de SU ciudad (sin importar por cuál enlace entró). */
export async function ingresar(documentoEscrito: string): Promise<ResultadoIngreso> {
  const documento = normalizeDocumento(documentoEscrito);
  if (!documento) return { tipo: "no_encontrado" };
  const { estudiantes, eventos, respuestas } = await clausura();
  const student = (await estudiantes.findOne({ documento }, { projection: PROYECCION })) as EstudianteLeido | null;
  if (!student) return { tipo: "no_encontrado" };
  const evento = eventoParaCiudad(await eventos.find({ estado: { $in: ["abierto", "cerrado"] } }).toArray(), student.ciudad);
  if (!evento) return { tipo: "pronto" };
  const [respuesta, celularMostrado] = await Promise.all([
    respuestas.findOne({ eventoId: evento._id, studentId: student._id }),
    celularDe(documento),
  ]);
  return { tipo: "ok", ctx: { student, evento, respuesta, celularMostrado } };
}

/** Contexto desde la cookie. null si el estudiante o el evento ya no existen o el evento ya no es de su ciudad. */
export async function cargar(s: SesionClausura): Promise<Contexto | null> {
  const { estudiantes, eventos, respuestas } = await clausura();
  const student = (await estudiantes.findOne({ _id: new ObjectId(s.studentId) }, { projection: PROYECCION })) as EstudianteLeido | null;
  if (!student) return null;
  const evento = eventoParaCiudad(await eventos.find({ estado: { $in: ["abierto", "cerrado"] } }).toArray(), student.ciudad);
  if (!evento || evento._id.toHexString() !== s.eventoId) return null;
  const [respuesta, celularMostrado] = await Promise.all([
    respuestas.findOne({ eventoId: evento._id, studentId: student._id }),
    celularDe(student.documento),
  ]);
  return { student, evento, respuesta, celularMostrado };
}

type Trabajo = { contacto: Contacto | null; respuestas: Respuestas; seccionActual: string };

/** Copia sobre la que trabaja: la respuesta en progreso, o el borrador si está editando una ya enviada. */
function trabajo(r: RespuestaClausura | null): Trabajo | null {
  if (!r) return null;
  if (r.estado === "enviada") return r.borradorEdicion;
  return { contacto: r.contacto, respuestas: r.respuestas, seccionActual: r.seccionActual };
}

/**
 * ¿Puede guardar cambios? Evento abierto y antes de la fecha límite. Después de enviar, NO, salvo que el evento lo
 * permita (--permitir-edicion=si) o que el admin haya reabierto su respuesta.
 */
export function puedeResponder(ctx: Pick<Contexto, "evento" | "respuesta">, ahora = new Date()): boolean {
  if (!aceptaRespuestas(ctx.evento, ahora)) return false;
  const r = ctx.respuesta;
  return r?.estado !== "enviada" || ctx.evento.permitirEdicion || !!r.reabierta;
}

function contactoVista(c: Contacto | null, ciudad: string) {
  if (!c) return null;
  return {
    correoConfirmado: c.correoConfirmado,
    correoNuevoOculto: c.correoNuevo ? ocultarCorreo(c.correoNuevo) : null,
    celularOculto: ocultarCelular(c.celular, ciudad),
    celularOrigen: c.celularOrigen,
    tieneWhatsApp: c.tieneWhatsApp,
    whatsappOculto: c.whatsapp ? ocultarCelular(c.whatsapp, ciudad) : null,
    genero: c.genero ?? null,
  };
}

/** Lo único que recibe el navegador del estudiante. Sin correo ni celular completos. */
export function vistaEstudiante(ctx: Contexto, ahora = new Date()) {
  const { student, evento, respuesta: r } = ctx;
  const editando = r?.estado === "enviada" && !!r.borradorEdicion;
  const t = trabajo(r);
  const visible = t ?? (r ? { contacto: r.contacto, respuestas: r.respuestas, seccionActual: "resumen" } : null);
  return {
    resultado: "ok" as const,
    evento: eventoVista(evento, ahora),
    estudiante: {
      nombre: nombreDe(student),
      /** Para validar el celular en el navegador con el país correcto. */
      ciudad: student.ciudad,
      correoOculto: ocultarCorreo(correoDe(student)),
      celularOculto: ctx.celularMostrado ? ocultarCelular(ctx.celularMostrado, student.ciudad) : null,
    },
    respuesta: {
      estado: r ? r.estado : ("nueva" as const),
      editando,
      seccionActual: visible?.seccionActual ?? "contacto",
      contacto: contactoVista(visible?.contacto ?? null, student.ciudad),
      respuestas: visible?.respuestas ?? {},
      enviadaEn: r?.enviadaEn?.toISOString() ?? null,
      editadaEn: r?.editadaEn?.toISOString() ?? null,
      reabierta: !!r?.reabierta,
    },
    /** Lo enviado dice que asistirá (Sí / Tengo inconvenientes): se ofrece el calendario. */
    asistira: r?.estado === "enviada" && asistira(evento, r.respuestas),
    puedeResponder: puedeResponder(ctx, ahora),
  };
}
export type VistaEstudiante = ReturnType<typeof vistaEstudiante>;

export type Resultado = { ok: true; ctx: Contexto; siguiente?: string } | { ok: false; status: number; error: string; errores?: Record<string, string>; seccion?: string };

const falla = (status: number, error: string, extra: Partial<Extract<Resultado, { ok: false }>> = {}): Resultado => ({ ok: false, status, error, ...extra });

async function recargar(ctx: Contexto): Promise<Contexto> {
  const { respuestas } = await clausura();
  return { ...ctx, respuesta: await respuestas.findOne({ eventoId: ctx.evento._id, studentId: ctx.student._id }) };
}

/** Formulario que responde este estudiante (con la regla del proyecto del evento). */
const formDe = (ctx: Pick<Contexto, "evento">) => formularioActivo(ctx.evento, ctx.evento.formulario);
const primeraSeccion = (ctx: Contexto, r: Respuestas) => camino(formDe(ctx), r).pasos[0]?.seccion.id ?? "resumen";

/** Guarda la copia de trabajo (crea la respuesta la primera vez). */
async function guardarTrabajo(ctx: Contexto, t: Trabajo & { contacto: Contacto }): Promise<Contexto> {
  const { respuestas } = await clausura();
  const ahora = new Date();
  const r = ctx.respuesta;
  if (r?.estado === "enviada") {
    await respuestas.updateOne({ _id: r._id, estado: "enviada" }, {
      $set: { borradorEdicion: { ...t, formularioVersion: ctx.evento.formularioVersion, actualizadaEn: ahora }, actualizadaEn: ahora },
    });
  } else if (r) {
    await respuestas.updateOne({ _id: r._id }, { $set: { ...t, formularioVersion: ctx.evento.formularioVersion, actualizadaEn: ahora } });
  } else {
    const doc: RespuestaClausura = {
      _id: new ObjectId(), eventoId: ctx.evento._id, studentId: ctx.student._id, documento: ctx.student.documento, ciudad: ctx.student.ciudad,
      formularioVersion: ctx.evento.formularioVersion, estado: "en_progreso", ...t,
      iniciadaEn: ahora, enviadaEn: null, editadaEn: null, ediciones: 0, borradorEdicion: null, reabierta: null, actualizadaEn: ahora,
    };
    try {
      await respuestas.insertOne(doc);
    } catch (e) {
      // Dos pestañas a la vez: el índice único deja una sola; se actualiza esa.
      if ((e as { code?: number }).code !== 11000) throw e;
      await respuestas.updateOne({ eventoId: doc.eventoId, studentId: doc.studentId, estado: "en_progreso" }, { $set: { ...t, actualizadaEn: ahora } });
    }
  }
  return recargar(ctx);
}

export const ContactoBody = z.object({
  correoConfirmado: z.boolean(),
  correoNuevo: z.string().max(150).optional(),
  /** "prellenado": el que se le mostró · "guardado": el que ya había guardado · nuevo: lo escribe. */
  celular: z.union([z.object({ usar: z.enum(["prellenado", "guardado"]) }).strict(), z.object({ nuevo: z.string().max(30) }).strict()]),
  whatsapp: z.enum(["mismo", "otro", "no"]),
  /** "Tu género" (del estudiante). */
  genero: z.enum(Object.keys(GENEROS) as [keyof typeof GENEROS, ...(keyof typeof GENEROS)[]]),
  /** Si whatsapp = "otro". Vacío = conservar el que ya había guardado. */
  whatsappNumero: z.string().max(30).optional(),
}).strict();

export async function guardarContacto(ctx: Contexto, body: z.infer<typeof ContactoBody>): Promise<Resultado> {
  if (!puedeResponder(ctx)) return falla(409, "cerrado");
  const r = ctx.respuesta;
  if (r?.estado === "enviada" && !r.borradorEdicion) return falla(409, "no_editando");
  const t = trabajo(r);
  const previo = t?.contacto ?? null;
  const ciudad = ctx.student.ciudad;
  const errores: Record<string, string> = {};

  let correoNuevo: string | null = null;
  if (!body.correoConfirmado) {
    if (body.correoNuevo?.trim()) {
      const chk = checkEmail(body.correoNuevo);
      const err = emailError(chk);
      if (err) errores.correoNuevo = err;
      else correoNuevo = chk.email;
    } else if (previo?.correoNuevo) correoNuevo = previo.correoNuevo;
    else errores.correoNuevo = "Escribe tu correo.";
  }

  let celular = "", celularOrigen: Contacto["celularOrigen"] = "nuevo";
  if ("nuevo" in body.celular) {
    const v = validarTelefono(body.celular.nuevo, ciudad);
    if (v.ok) celular = v.digitos; else errores.celular = "Escribe un número de celular válido.";
  } else if (body.celular.usar === "prellenado" && ctx.celularMostrado) {
    celular = ctx.celularMostrado.replace(/\D/g, ""); celularOrigen = "prellenado";
  } else if (body.celular.usar === "guardado" && previo?.celular) {
    celular = previo.celular; celularOrigen = previo.celularOrigen;
  } else errores.celular = "Escribe tu número de celular.";

  let whatsapp: string | null = null;
  if (body.whatsapp === "otro") {
    if (body.whatsappNumero?.trim()) {
      const v = validarTelefono(body.whatsappNumero, ciudad);
      if (v.ok) whatsapp = v.digitos; else errores.whatsappNumero = "Escribe un número de WhatsApp válido.";
    } else if (previo?.whatsapp) whatsapp = previo.whatsapp;
    else errores.whatsappNumero = "Escribe tu número de WhatsApp.";
  }
  if (Object.keys(errores).length) return falla(400, "datos_invalidos", { errores });

  const contacto: Contacto = {
    correoMostrado: correoDe(ctx.student), correoConfirmado: body.correoConfirmado, correoNuevo,
    celularMostrado: ctx.celularMostrado, celular, celularOrigen,
    tieneWhatsApp: body.whatsapp !== "no", whatsapp, genero: body.genero,
  };
  const respuestas = t?.respuestas ?? {};
  const siguiente = !t || t.seccionActual === "contacto" ? primeraSeccion(ctx, respuestas) : t.seccionActual;
  const nuevo = await guardarTrabajo(ctx, { contacto, respuestas, seccionActual: siguiente });
  return { ok: true, ctx: nuevo, siguiente };
}

/** Valor de una respuesta tal como llega del navegador (null = borrar). */
const ValorBody = z.union([z.string().max(3000), z.number(), z.array(z.string().max(40)).max(60), z.null()]);
export const SeccionBody = z.object({ seccion: z.string().max(40), respuestas: z.record(z.string().max(50), ValorBody) }).strict();

/** Autoguardado al pasar de sección: valida solo esa sección (con Zod generada), limpia ramas ocultas y avanza. */
export async function guardarSeccion(ctx: Contexto, body: z.infer<typeof SeccionBody>): Promise<Resultado> {
  if (!puedeResponder(ctx)) return falla(409, "cerrado");
  const t = trabajo(ctx.respuesta);
  if (!t?.contacto) return falla(409, "contacto_primero");
  const f = formDe(ctx);
  const seccion = f.secciones.find((s) => s.id === body.seccion);
  if (!seccion) return falla(400, "seccion_desconocida");

  // Solo se aceptan claves de esa sección. Las de la sección se reemplazan completas (lo que no viene, se borra).
  const propias = new Set(seccion.items.flatMap((i) => (esPregunta(i) ? [i.id, claveOtro(i.id)] : [i.id])));
  const merged: Respuestas = { ...t.respuestas };
  for (const id of propias) delete merged[id];
  for (const [id, v] of Object.entries(body.respuestas)) if (propias.has(id) && v !== null) merged[id] = v;

  const v = validarRespuestas(f, merged, seccion.id);
  if (!v.ok) return falla(400, v.errores._seccion ? "seccion_fuera" : "datos_invalidos", { errores: v.errores });
  const siguiente = siguienteSeccion(f, v.respuestas, seccion.id) ?? "resumen";
  const nuevo = await guardarTrabajo(ctx, { contacto: t.contacto, respuestas: v.respuestas, seccionActual: siguiente });
  return { ok: true, ctx: nuevo, siguiente };
}

/** Enviar (o reenviar una edición): el servidor valida todo el camino. */
export async function enviar(ctx: Contexto): Promise<Resultado> {
  if (!puedeResponder(ctx)) return falla(409, "cerrado");
  const r = ctx.respuesta;
  const t = trabajo(r);
  if (!r || !t?.contacto) return falla(409, "contacto_primero");
  const f = formDe(ctx);
  const v = validarRespuestas(f, t.respuestas);
  if (!v.ok) {
    const conError = camino(f, v.respuestas).pasos.find((p) => p.items.some((i) => v.errores[i.id]));
    return falla(400, "datos_invalidos", { errores: v.errores, seccion: conError?.seccion.id });
  }
  const { respuestas } = await clausura();
  const ahora = new Date();
  if (r.estado === "enviada") {
    await respuestas.updateOne({ _id: r._id }, {
      $set: { contacto: t.contacto, respuestas: v.respuestas, formularioVersion: ctx.evento.formularioVersion, editadaEn: ahora, borradorEdicion: null, reabierta: null, seccionActual: "resumen", actualizadaEn: ahora },
      $inc: { ediciones: 1 },
    });
  } else {
    await respuestas.updateOne({ _id: r._id }, {
      $set: { estado: "enviada", respuestas: v.respuestas, formularioVersion: ctx.evento.formularioVersion, enviadaEn: ahora, seccionActual: "resumen", actualizadaEn: ahora },
    });
  }
  return { ok: true, ctx: await recargar(ctx) };
}

/** Empezar o cancelar la edición de una respuesta ya enviada. */
export async function edicion(ctx: Contexto, accion: "empezar" | "cancelar"): Promise<Resultado> {
  const r = ctx.respuesta;
  if (!r || r.estado !== "enviada") return falla(409, "no_enviada");
  const { respuestas } = await clausura();
  const ahora = new Date();
  if (accion === "cancelar") {
    await respuestas.updateOne({ _id: r._id }, { $set: { borradorEdicion: null, actualizadaEn: ahora } });
  } else {
    if (!puedeResponder(ctx)) return falla(409, "cerrado");
    if (!r.borradorEdicion && r.contacto) {
      await respuestas.updateOne({ _id: r._id, borradorEdicion: null }, {
        $set: { borradorEdicion: { contacto: r.contacto, respuestas: r.respuestas, seccionActual: "resumen", formularioVersion: ctx.evento.formularioVersion, actualizadaEn: ahora } },
      });
    }
  }
  return { ok: true, ctx: await recargar(ctx) };
}
