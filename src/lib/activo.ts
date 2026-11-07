// Estado activo/inactivo del estudiante: piezas puras que usan el servidor y la interfaz.
// Sin migración: un documento sin el campo `activo` está activo. Solo `activo: false` es inactivo.

/** Filtro de Mongo para contar o listar solo activos. */
export const SOLO_ACTIVOS = { activo: { $ne: false } } as const;

/** `{}` si se piden también los inactivos; si no, solo activos. */
export const filtroActivos = (incluirInactivos: boolean) => (incluirInactivos ? {} : SOLO_ACTIVOS);

export const esInactivo = (d: { activo?: boolean | null } | null | undefined) => d?.activo === false;

/** `?inactivos=1` en la URL: incluir inactivos (exportaciones y listas). */
export const pideInactivos = (url: string) => new URL(url, "http://x").searchParams.get("inactivos") === "1";

/** Lo que ve el panel de un inactivo (etiqueta y detalle). null si está activo. */
export type InfoInactivo = { motivo: string; en: string | null; por: string | null } | null;

export function infoInactivo(d: { activo?: boolean; inactivoMotivo?: string; inactivoEn?: Date; inactivoPor?: { nombre?: string; usuario?: string } }): InfoInactivo {
  if (d.activo !== false) return null;
  return { motivo: d.inactivoMotivo ?? "", en: d.inactivoEn?.toISOString() ?? null, por: d.inactivoPor?.nombre || d.inactivoPor?.usuario || null };
}

/** Quita las filas inactivas: los totales y porcentajes se calculan siempre sobre esto. */
export const soloActivos = <T extends { inactivo?: InfoInactivo }>(filas: readonly T[]): T[] => filas.filter((f) => !f.inactivo);

/** Filas que se muestran: los inactivos solo con el filtro "Mostrar inactivos". */
export const visiblesSegunFiltro = <T extends { inactivo?: InfoInactivo }>(filas: readonly T[], mostrarInactivos: boolean): T[] =>
  mostrarInactivos ? [...filas] : soloActivos(filas);

export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 300;

/** Mensaje que ve un estudiante inactivo al entrar con su documento (validación y clausura). */
export const MENSAJE_INACTIVO = "Escríbele a tu monitor";
