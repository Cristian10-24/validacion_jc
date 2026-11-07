// Excel de respuestas de la clausura, como la descarga de Google Forms: una fila por estudiante y una columna por
// pregunta (encabezado = texto de la pregunta). Casillas unidas con ", ", "Otro: <texto>", preguntas saltadas en blanco.
// Hoja "Preguntas" con el ID, el evento, la sección, el texto y el tipo. Solo LEE. Monitor: solo sus ciudades.
import ExcelJS from "exceljs";
import { ObjectId } from "mongodb";
import type { SessionUser } from "@/lib/auth";
import { celularConIndicativo } from "@/lib/testimonios/celular";
import type { Student } from "@/lib/types";
import { GENEROS } from "./contacto";
import { clausura, type RespuestaClausura } from "./db";
import { claveOtro, esPregunta, type Formulario, type Pregunta } from "./formulario/esquema";
import { textoRespuesta } from "./formulario/mostrar";
import { alcanceEvento, eventosVisibles, formulariosPorVersion, proyectoDe } from "./panel";

const ESTADO = { enviada: "Respondió", en_progreso: "En progreso" } as const;
const fecha = (d: Date | null | undefined) => (d ? d.toLocaleString("es-CO", { timeZone: "America/Bogota", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "");

type Columna = { id: string; titulo: string };
type FilaExcel = { base: string[]; r: RespuestaClausura | undefined; preguntas: Map<string, Pregunta> };

export async function excelClausura(user: Pick<SessionUser, "rol" | "ciudades">, opciones: { evento: string; sinResponder: boolean }) {
  const { eventos, estudiantes, respuestas, comentarios } = await clausura();
  let lista = eventosVisibles(await eventos.find({ estado: { $ne: "borrador" } }).sort({ inicio: 1 }).toArray(), user);
  if (opciones.evento !== "todos") lista = lista.filter((e) => e._id.toHexString() === opciones.evento);

  // Columnas de preguntas: unión por ID, en el orden en que aparecen (así "todos los eventos" alinea columnas).
  const columnas: Columna[] = [];
  const preguntasHoja: (string | number)[][] = [];
  const forms = new Map<string, Map<number, Formulario>>();
  const filas: FilaExcel[] = [];

  for (const e of lista) {
    const alumnos = (await estudiantes.find(alcanceEvento(e, user), { projection: { documento: 1, nombre: 1, nombrePropuesto: 1, ciudad: 1, grupo: 1, correo: 1, correoPropuesto: 1 } })
      .sort({ ciudad: 1, nombre: 1 }).toArray()) as Pick<Student, "_id" | "documento" | "nombre" | "nombrePropuesto" | "ciudad" | "grupo" | "correo" | "correoPropuesto">[];
    const resp = await respuestas.find({ eventoId: e._id, studentId: { $in: alumnos.map((a) => a._id) } }).toArray();
    const porAlumno = new Map(resp.map((r) => [r.studentId.toHexString(), r]));
    const notas = await comentarios.find({ eventoId: e._id, studentId: { $in: alumnos.map((a) => a._id) } }).sort({ fecha: 1 }).toArray();
    const fs = await formulariosPorVersion(e, resp.map((r) => r.formularioVersion));
    forms.set(e._id.toHexString(), fs);
    const actual = fs.get(e.formularioVersion)!;
    for (const s of actual.secciones) {
      for (const p of s.items.filter(esPregunta)) {
        if (!columnas.some((c) => c.id === p.id)) columnas.push({ id: p.id, titulo: p.titulo });
        preguntasHoja.push([p.id, `${e.titulo} · ${e.nombreVisible}`, s.titulo, p.titulo, p.tipo, p.obligatoria ? "Sí" : "No", p.archivada ? "Sí" : "No"]);
      }
    }
    for (const a of alumnos) {
      const r = porAlumno.get(a._id.toHexString());
      if (!r && !opciones.sinResponder) continue;
      const f = r ? fs.get(r.formularioVersion) ?? actual : actual;
      const preguntas = new Map<string, Pregunta>();
      for (const s of f.secciones) for (const p of s.items.filter(esPregunta)) preguntas.set(p.id, p);
      const c = r?.contacto;
      const pa = e.preguntaAsistencia ? preguntas.get(e.preguntaAsistencia) : undefined;
      const proy = proyectoDe(e, f, r);
      const notasDe = notas.filter((n) => n.studentId.equals(a._id)).map((n) => `${fecha(n.fecha)} · ${n.autor.nombre}: ${n.texto}`).join("\n");
      filas.push({
        r, preguntas,
        base: [
          `${e.titulo} · ${e.nombreVisible}`, a.ciudad, a.documento, a.nombrePropuesto ?? a.nombre, a.grupo ?? "",
          r ? ESTADO[r.estado] : "Sin responder",
          pa && r ? textoRespuesta(pa, r.respuestas[pa.id], r.respuestas[claveOtro(pa.id)]) : "",
          proy ? (proy.presenta ? "Sí" : "No") : "",
          c?.correoMostrado ?? a.correoPropuesto ?? a.correo ?? "", c ? (c.correoConfirmado ? "Sí" : "No") : "", c?.correoNuevo ?? "",
          c?.celular ? celularConIndicativo(c.celular, a.ciudad) : "",
          !c ? "" : !c.tieneWhatsApp ? "No tiene" : c.whatsapp ? celularConIndicativo(c.whatsapp, a.ciudad) : "Mismo número",
          c?.genero ? GENEROS[c.genero] : "",
          fecha(r?.iniciadaEn), fecha(r?.enviadaEn), fecha(r?.editadaEn), r?.reabierta ? `${r.reabierta.por} · ${fecha(r.reabierta.en)}` : "", notasDe,
        ],
      });
    }
  }

  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet("Respuestas", { views: [{ state: "frozen", ySplit: 1, xSplit: 4 }] });
  const fijas = ["Evento", "Ciudad", "Documento", "Nombre", "Grupo", "Estado", "Asistencia", "Presenta proyecto", "Correo original", "¿Confirmó el correo?", "Correo nuevo",
    "Celular", "WhatsApp", "Género", "Inicio", "Envío", "Última edición", "Reabierta por", "Comentarios del monitor"];
  hoja.addRow([...fijas, ...columnas.map((c) => c.titulo)]);
  for (const fila of filas) {
    const r = fila.r?.respuestas;
    const valores = columnas.map((c) => {
      const p = fila.preguntas.get(c.id);
      return p && r ? textoRespuesta(p, r[c.id], r[claveOtro(c.id)]) : "";
    });
    hoja.addRow([...fila.base, ...valores]);
  }
  hoja.getRow(1).font = { bold: true };
  hoja.columns.forEach((col, i) => { col.width = i < fijas.length ? 18 : 34; });
  hoja.getColumn(fijas.length).alignment = { wrapText: true, vertical: "top" };

  const hp = libro.addWorksheet("Preguntas");
  hp.addRow(["ID", "Evento", "Sección", "Pregunta", "Tipo", "Obligatoria", "Archivada"]);
  for (const p of preguntasHoja) hp.addRow(p);
  hp.getRow(1).font = { bold: true };
  hp.columns.forEach((c, i) => { c.width = [24, 30, 30, 70, 14, 12, 12][i]; });

  const nombre = opciones.evento === "todos" || lista.length !== 1 ? "clausura_todos" : `clausura_${lista[0]!.slug}`;
  return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), archivo: `${nombre}.xlsx`, filas: filas.length };
}

export const eventoValido = (v: string | null) => (v === "todos" || (v !== null && ObjectId.isValid(v)) ? v : null);
