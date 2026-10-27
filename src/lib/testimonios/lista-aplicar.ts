// Aplicación de la lista de participantes (escribe SOLO en colecciones testimonios_*) y re-cruce posterior.
import { ObjectId, type AnyBulkWriteOperation } from "mongodb";
import { testimonios, type Participante, type Respuesta } from "./db";
import { leerParticipantes, planificarLista, type PlanLista } from "./lista";
import { operacionCruce, planRecruce } from "./recruce";

export async function vistaPreviaLista(rows: Record<string, string>[]): Promise<PlanLista> {
  const { participantes } = await testimonios();
  return planificarLista(rows, await participantes.find({}).toArray());
}

/** Vuelve a cruzar todas las respuestas con la lista actual. Devuelve cuántas cambiaron. */
export async function recruzarTodo(): Promise<number> {
  const { participantes, respuestas } = await testimonios();
  const lista = await participantes.find({}, { projection: { documento: 1, correo: 1, celularClave: 1 } }).toArray();
  const actuales = await respuestas.find({}, { projection: { cruce: 1, participanteId: 1, cruzadoPor: 1, candidatos: 1, norm: 1 } }).toArray();
  const cambios = planRecruce(actuales, lista.map((p) => ({ id: p._id.toHexString(), documento: p.documento || null, correo: p.correo || null, celular: p.celularClave ?? null })));
  if (cambios.length) {
    await respuestas.bulkWrite(cambios.map((c): AnyBulkWriteOperation<Respuesta> => ({ updateOne: { filter: { _id: c.id }, update: operacionCruce(c.set) } })));
  }
  return cambios.length;
}

export type ResultadoLista = { insertados: number; actualizados: number; eliminados: number; recruzadas: number };

/**
 * Aplica el archivo. Vuelve a calcular el plan en este momento y solo elimina a los ausentes
 * que sigan ausentes y estén marcados. Sus comentarios y respuestas se conservan (las respuestas
 * se vuelven a cruzar: si nadie más coincide, quedan en "Sin dueño").
 */
export async function aplicarLista(rows: Record<string, string>[], eliminarIds: string[], por: string): Promise<ResultadoLista & { plan: PlanLista }> {
  const { participantes, auditoria } = await testimonios();
  const plan = planificarLista(rows, await participantes.find({}).toArray());
  const now = new Date();

  if (plan.nuevos.length) {
    await participantes.insertMany(plan.nuevos.map((f): Participante => ({
      _id: new ObjectId(), documento: f.documento, nombres: f.nombres, apellidos: f.apellidos, nombre: f.nombre,
      celular: f.celular, celularClave: f.celularClave, correo: f.correo, ciudad: f.ciudad, ciudadOriginal: f.ciudadOriginal,
      creadoEn: now, actualizadoEn: now,
    })));
  }

  const { filas } = leerParticipantes(rows);
  const porDoc = new Map(filas.map((f) => [f.documento, f]));
  const ops: AnyBulkWriteOperation<Participante>[] = plan.cambiados.map((c) => {
    const f = porDoc.get(c.documento)!;
    return {
      updateOne: {
        filter: { _id: new ObjectId(c.id) },
        update: { $set: { nombres: f.nombres, apellidos: f.apellidos, nombre: f.nombre, celular: f.celular, celularClave: f.celularClave, correo: f.correo, ciudad: f.ciudad, ciudadOriginal: f.ciudadOriginal, actualizadoEn: now } },
      },
    };
  });
  const actualizados = ops.length ? (await participantes.bulkWrite(ops)).modifiedCount : 0;

  const ausentes = new Set(plan.ausentes.map((a) => a.id));
  const borrar = [...new Set(eliminarIds)].filter((id) => ausentes.has(id)).map((id) => new ObjectId(id));
  const eliminados = borrar.length ? (await participantes.deleteMany({ _id: { $in: borrar } })).deletedCount : 0;

  const recruzadas = await recruzarTodo();
  await auditoria.insertOne({
    accion: "subir_lista", por, fecha: now,
    detalle: { filasLeidas: plan.filasLeidas, insertados: plan.nuevos.length, actualizados, eliminados, eliminadosIds: borrar.map(String), recruzadas, errores: plan.errores.length },
  });
  return { plan, insertados: plan.nuevos.length, actualizados, eliminados, recruzadas };
}
