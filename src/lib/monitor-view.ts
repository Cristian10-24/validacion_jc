import type { Collection } from "mongodb";
import type { Student } from "./types";
import { checkEmail } from "./validation/email";
import { nameWarnings } from "./validation/name";

/** Fila del panel del monitor. `nombre`/`correo` son los oficiales; `*Propuesto` lo que envió el estudiante. */
export function monitorRow(s: Student, repetidos: Set<string>) {
  const correoActual = s.correoPropuesto ?? s.correo;
  const check = checkEmail(correoActual);
  return {
    id: s._id.toHexString(),
    documento: s.documento,
    ciudad: s.ciudad,
    grupo: s.grupo,
    estado: s.estado,
    nombre: s.nombre,
    correo: s.correo,
    nombrePropuesto: s.nombrePropuesto ?? null,
    correoPropuesto: s.correoPropuesto ?? null,
    fecha: (s.estado === "validado" ? s.validadoEn : s.estado === "corregido" ? s.actualizadoEn : null)?.toISOString() ?? null,
    validadoPor: s.validadoPor?.rol ?? null,
    avisos: {
      correoRepetido: !!check.email && repetidos.has(check.email),
      correoInstitucional: check.educational,
      correoInvalido: !check.valid,
      sinTildes: nameWarnings(s.nombrePropuesto ?? s.nombre).includes("sin_tildes"),
    },
  };
}

export type MonitorRow = ReturnType<typeof monitorRow>;

/** Correos que usa más de un estudiante (en todas las ciudades), contando también los propuestos. */
export async function correosRepetidos(students: Collection<Student>): Promise<Set<string>> {
  const all = await students.find({}, { projection: { correoNorm: 1, correoPropuesto: 1 } }).toArray();
  const count = new Map<string, number>();
  for (const s of all) {
    const e = s.correoPropuesto ?? s.correoNorm;
    if (e) count.set(e, (count.get(e) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([e]) => e));
}
