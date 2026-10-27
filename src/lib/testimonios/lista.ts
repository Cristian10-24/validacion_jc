// Lista de participantes de testimonios (independiente de la lista de validación de datos).
// Lectura y comparación con la lista actual: funciones puras. La aplicación (escritura) está en aplicarLista.
import { normalizeEmail, isValidEmailFormat } from "@/lib/validation/email";
import { cleanSpaces, normalizeDocumento, toProperName } from "@/lib/validation/name";
import { resolverCiudad } from "./ciudades";
import { claveCelular } from "./cruce";
import type { Participante } from "./db";

// Columnas aceptadas (encabezados normalizados por readRowsFromBuffer: minúsculas, sin tildes).
const COLUMNAS = {
  nombres: ["nombres", "nombre", "nombre s"],
  apellidos: ["apellidos", "apellido", "apellido s"],
  celular: ["celular", "numero de whatsapp o celular", "whatsapp", "telefono", "movil", "numero de celular"],
  correo: ["correo", "email", "e mail", "correo electronico"],
  documento: ["documento", "numero de documento", "id", "cedula", "identificacion", "no documento"],
  ciudad: ["ciudad", "ciudad a la que perteneces", "municipio"],
} as const;

function pick(row: Record<string, string>, campo: keyof typeof COLUMNAS): string {
  for (const k of COLUMNAS[campo]) if (row[k]) return row[k];
  return "";
}

export type FilaParticipante = {
  fila: number;
  documento: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  celular: string;
  celularClave: string | null;
  correo: string;
  ciudad: string;
  ciudadOriginal: string | null;
};
export type Problema = { fila: number; documento?: string; mensaje: string };

export function leerParticipantes(rows: Record<string, string>[]) {
  const filas: FilaParticipante[] = [];
  const errores: Problema[] = [];
  const avisos: Problema[] = [];
  const vistos = new Set<string>();

  rows.forEach((row, i) => {
    const fila = i + 2; // la fila 1 son los encabezados
    const documento = normalizeDocumento(pick(row, "documento"));
    const nombres = toProperName(cleanSpaces(pick(row, "nombres")));
    const apellidos = toProperName(cleanSpaces(pick(row, "apellidos")));
    const ciudadTexto = cleanSpaces(pick(row, "ciudad"));
    const { ciudad, ciudadOriginal } = resolverCiudad(ciudadTexto);
    const celularTexto = cleanSpaces(pick(row, "celular"));
    const correoTexto = pick(row, "correo");

    if (!documento) return void errores.push({ fila, mensaje: "Sin número de documento" });
    if (!nombres && !apellidos) return void errores.push({ fila, documento, mensaje: "Sin nombres ni apellidos" });
    if (!ciudadTexto) return void errores.push({ fila, documento, mensaje: "Sin ciudad" });
    if (!ciudad) return void errores.push({ fila, documento, mensaje: `Ciudad no reconocida: "${ciudadTexto}"` });
    if (vistos.has(documento)) return void errores.push({ fila, documento, mensaje: "Documento repetido en el archivo" });
    vistos.add(documento);

    const correo = normalizeEmail(correoTexto);
    const celularClave = claveCelular(celularTexto);
    if (correo && !isValidEmailFormat(correo)) avisos.push({ fila, documento, mensaje: `Correo con formato inválido: ${correoTexto}` });
    if (celularTexto && !celularClave) avisos.push({ fila, documento, mensaje: `Celular muy corto para cruzar: ${celularTexto}` });
    if (!correo && !celularClave) avisos.push({ fila, documento, mensaje: "Sin correo ni celular: solo podrá cruzar por documento" });
    if (ciudadOriginal) avisos.push({ fila, documento, mensaje: `Ciudad "${ciudadOriginal}" se guarda como ${ciudad}` });

    filas.push({
      fila, documento, nombres, apellidos, nombre: cleanSpaces(`${nombres} ${apellidos}`),
      celular: celularTexto.replace(/\D/g, ""), celularClave, correo, ciudad, ciudadOriginal,
    });
  });
  return { filas, errores, avisos };
}

const CAMPOS = ["nombres", "apellidos", "celular", "correo", "ciudad", "ciudadOriginal"] as const;
export type CampoLista = (typeof CAMPOS)[number];
export type CambioLista = { campo: CampoLista; antes: string; despues: string };
export type Existente = { id: string; documento: string; nombre: string; ciudad: string };

export type PlanLista = {
  columnas: string[];
  filasLeidas: number;
  nuevos: FilaParticipante[];
  cambiados: (Existente & { fila: number; cambios: CambioLista[] })[];
  ausentes: Existente[];
  sinCambios: number;
  errores: Problema[];
  avisos: Problema[];
  ciudades: Record<string, number>;
};

/** Compara el archivo con la lista actual. No escribe nada. */
export function planificarLista(rows: Record<string, string>[], actuales: Participante[]): PlanLista {
  const { filas, errores, avisos } = leerParticipantes(rows);
  const porDoc = new Map(actuales.map((p) => [p.documento, p]));
  const enArchivo = new Set(filas.map((f) => f.documento));
  const plan: PlanLista = {
    columnas: Object.keys(rows[0] ?? {}), filasLeidas: rows.length,
    nuevos: [], cambiados: [], ausentes: [], sinCambios: 0, errores, avisos, ciudades: {},
  };
  for (const f of filas) {
    plan.ciudades[f.ciudad] = (plan.ciudades[f.ciudad] ?? 0) + 1;
    const p = porDoc.get(f.documento);
    if (!p) { plan.nuevos.push(f); continue; }
    const cambios = CAMPOS
      .map((c) => ({ campo: c, antes: String(p[c] ?? ""), despues: String(f[c] ?? "") }))
      .filter((c) => c.antes !== c.despues);
    if (cambios.length === 0) plan.sinCambios++;
    else plan.cambiados.push({ id: p._id.toHexString(), documento: p.documento, nombre: p.nombre, ciudad: p.ciudad, fila: f.fila, cambios });
  }
  plan.ausentes = actuales
    .filter((p) => !enArchivo.has(p.documento))
    .map((p) => ({ id: p._id.toHexString(), documento: p.documento, nombre: p.nombre, ciudad: p.ciudad }))
    .sort((a, b) => a.ciudad.localeCompare(b.ciudad, "es") || a.nombre.localeCompare(b.nombre, "es"));
  return plan;
}
