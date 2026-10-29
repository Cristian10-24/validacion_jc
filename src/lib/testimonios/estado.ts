// Estado de cada participante (se calcula al leer; no se guarda) y orden de la lista. Funciones puras.
// Solo dos estados. "Con comentarios" es una etiqueta de los pendientes (alguien ya lo contactó), no un estado.

export type EstadoTestimonio = "realizado" | "pendiente";

/**
 * Fecha de la marca temporal del Sheet. Llega como texto visible, normalmente "dd/mm/aaaa h:mm:ss"
 * (configuración regional de Colombia) o ISO. Devuelve milisegundos, o null si no se entiende.
 */
export function parseMarcaTemporal(texto: string | null | undefined): number | null {
  const t = String(texto ?? "").trim();
  if (!t) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s*m\.?)?)?/i.exec(t);
  if (m) {
    let h = Number(m[4] ?? 0);
    const ampm = m[7]?.toLowerCase().replace(/[.\s]/g, "");
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    // Hora de Colombia (UTC-5), como la registra el formulario.
    return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), h + 5, Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  const iso = Date.parse(t);
  return Number.isNaN(iso) ? null : iso;
}

/**
 * Realizado si tiene al menos un envío asignado (cruce automático o manual); si no, Pendiente, tenga o no
 * comentarios. Las respuestas sin dueño, en conflicto o descartadas no cuentan como envío.
 */
export function estadoDe(enviosAsignados: number): EstadoTestimonio {
  return enviosAsignados > 0 ? "realizado" : "pendiente";
}

/**
 * Actividad más reciente entre los comentarios: la mayor fecha entre la creación y la edición de cada uno.
 * Devuelve qué comentario fue, su fecha (ms) y si esa fecha es la de una edición. null si no hay comentarios.
 */
export function ultimaActividad(comentarios: { fecha: string; editadoEn?: string | null }[]): { indice: number; ms: number; editado: boolean } | null {
  let mejor: { indice: number; ms: number; editado: boolean } | null = null;
  comentarios.forEach((c, indice) => {
    const creado = Date.parse(c.fecha), editado = c.editadoEn ? Date.parse(c.editadoEn) : NaN;
    const actividad = editado > creado ? { ms: editado, editado: true } : { ms: creado, editado: false };
    if (!mejor || actividad.ms > mejor.ms) mejor = { indice, ...actividad };
  });
  return mejor;
}

export type FilaOrdenTestimonio = { estado: EstadoTestimonio; nombre: string; ultimoEnvio: number | null; ultimoComentario: number | null };

/** 0: pendiente sin comentarios · 1: pendiente con comentarios · 2: realizado. */
const grupo = (f: FilaOrdenTestimonio) => (f.estado === "realizado" ? 2 : f.ultimoComentario === null ? 0 : 1);

/**
 * Orden de "Todos" y de "Pendiente": primero los pendientes sin comentarios (alfabético: nadie los ha
 * contactado), luego los pendientes con comentarios (la actividad más reciente primero, contando las
 * ediciones: ver ultimaActividad) y al final los
 * realizados (el envío más reciente primero). Se mantiene con búsqueda, filtro de ciudad y refresco.
 */
export function compararTestimonios(a: FilaOrdenTestimonio, b: FilaOrdenTestimonio): number {
  const g = grupo(a) - grupo(b);
  if (g !== 0) return g;
  const d = grupo(a) === 1 ? (b.ultimoComentario ?? 0) - (a.ultimoComentario ?? 0)
    : grupo(a) === 2 ? (b.ultimoEnvio ?? 0) - (a.ultimoEnvio ?? 0) : 0;
  return d !== 0 ? d : a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
}
