// Registro de respuestas de la encuesta (las envía el Apps Script al webhook propio del módulo).
// Solo escribe en encuesta_respuestas. Idempotente: la misma respuesta dos veces no se duplica.
// El cruce con participantes NO se guarda: se calcula al leer (ver cruce.ts).
import { ObjectId } from "mongodb";
import { claveRespuestaEncuesta, normalizarRespuestaEncuesta } from "./cruce";
import { encuesta, type RespuestaEncuesta } from "./db";

export type ResultadoRegistroEncuesta =
  | { estado: "nueva"; id: string }
  | { estado: "duplicada"; id: string }
  | { estado: "invalida"; motivo: string };

export async function registrarRespuestasEncuesta(items: { respuesta: Record<string, unknown>; fila?: number | null }[]): Promise<ResultadoRegistroEncuesta[]> {
  const { respuestas } = await encuesta();
  const resultados: ResultadoRegistroEncuesta[] = [];

  for (const { respuesta, fila } of items) {
    const norm = normalizarRespuestaEncuesta(respuesta);
    if (!norm.marcaTemporal) { resultados.push({ estado: "invalida", motivo: "Falta la marca temporal" }); continue; }
    if (!norm.documento && !norm.correo) { resultados.push({ estado: "invalida", motivo: "La respuesta no trae documento ni correo" }); continue; }

    const clave = claveRespuestaEncuesta(norm);
    const existente = await respuestas.findOne({ clave }, { projection: { _id: 1 } });
    if (existente) { resultados.push({ estado: "duplicada", id: existente._id.toHexString() }); continue; }

    const doc: RespuestaEncuesta = {
      _id: new ObjectId(), clave, recibidaEn: new Date(), marcaTemporal: norm.marcaTemporal, fila: fila ?? null,
      original: respuesta, norm,
    };
    try {
      await respuestas.insertOne(doc);
      resultados.push({ estado: "nueva", id: doc._id.toHexString() });
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
