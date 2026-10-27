// Registro de respuestas del Google Form (las envía el Apps Script al webhook).
// Solo escribe en testimonios_respuestas. Idempotente: la misma respuesta dos veces no se duplica.
import { ObjectId } from "mongodb";
import { claveRespuesta, construirIndice, cruzar, normalizarRespuesta, type ResultadoCruce } from "./cruce";
import { testimonios, type Participante, type Respuesta } from "./db";

export type ResultadoRegistro =
  | { estado: "nueva"; id: string; cruce: ResultadoCruce["cruce"]; cruzadoPor?: string }
  | { estado: "duplicada"; id: string }
  | { estado: "invalida"; motivo: string };

/** Índice de cruce con la lista actual de participantes. */
export async function indiceParticipantes() {
  const { participantes } = await testimonios();
  const lista = await participantes.find({}, { projection: { documento: 1, correo: 1, celularClave: 1 } }).toArray();
  return construirIndice(lista.map((p: Pick<Participante, "_id" | "documento" | "correo" | "celularClave">) => ({
    id: p._id.toHexString(), documento: p.documento || null, correo: p.correo || null, celular: p.celularClave ?? null,
  })));
}

/** Campos de cruce que se guardan según el resultado. */
export function camposCruce(r: ResultadoCruce): Pick<Respuesta, "participanteId" | "cruce" | "cruzadoPor" | "candidatos"> {
  if (r.cruce === "auto") return { participanteId: new ObjectId(r.participanteId), cruce: "auto", cruzadoPor: r.por, candidatos: undefined };
  if (r.cruce === "conflicto") return { participanteId: null, cruce: "conflicto", cruzadoPor: undefined, candidatos: r.candidatos.map((id) => new ObjectId(id)) };
  return { participanteId: null, cruce: "sin_duenio", cruzadoPor: undefined, candidatos: undefined };
}

export async function registrarRespuestas(items: { respuesta: Record<string, unknown>; fila?: number | null }[]): Promise<ResultadoRegistro[]> {
  const { respuestas } = await testimonios();
  const ix = await indiceParticipantes();
  const resultados: ResultadoRegistro[] = [];

  for (const { respuesta, fila } of items) {
    const norm = normalizarRespuesta(respuesta);
    if (!norm.marcaTemporal) { resultados.push({ estado: "invalida", motivo: "Falta la marca temporal" }); continue; }
    if (!norm.documento && !norm.correo && !norm.celular && norm.enlaces.length === 0) {
      resultados.push({ estado: "invalida", motivo: "La respuesta no trae datos" });
      continue;
    }
    const clave = claveRespuesta(norm);
    const existente = await respuestas.findOne({ clave }, { projection: { _id: 1 } });
    if (existente) { resultados.push({ estado: "duplicada", id: existente._id.toHexString() }); continue; }

    const cruce = cruzar(norm, ix);
    const doc: Respuesta = {
      _id: new ObjectId(), clave, recibidaEn: new Date(), marcaTemporal: norm.marcaTemporal, fila: fila ?? null,
      original: respuesta,
      norm: { nombre: norm.nombre, documento: norm.documento, correo: norm.correo, celular: norm.celular, ciudad: norm.ciudad, ciudadOriginal: norm.ciudadOriginal },
      enlaces: norm.enlaces,
      ...camposCruce(cruce),
    };
    try {
      await respuestas.insertOne(doc);
      resultados.push({ estado: "nueva", id: doc._id.toHexString(), cruce: cruce.cruce, cruzadoPor: doc.cruzadoPor });
    } catch (e) {
      // Dos envíos simultáneos de la misma respuesta: el índice único de "clave" deja pasar solo uno.
      if ((e as { code?: number }).code === 11000) {
        const ya = await respuestas.findOne({ clave }, { projection: { _id: 1 } });
        resultados.push({ estado: "duplicada", id: ya?._id.toHexString() ?? "" });
      } else throw e;
    }
  }
  return resultados;
}
