// Estado de cada participante (se calcula al leer; no se guarda) y orden de la lista. Funciones puras.

export type EstadoTestimonio = "realizado" | "seguimiento" | "pendiente";

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

/** Realizado si tiene al menos un envío asignado; Seguimiento si no, pero tiene comentarios; si no, Pendiente. */
export function estadoDe(envios: number, comentarios: number): EstadoTestimonio {
  if (envios > 0) return "realizado";
  if (comentarios > 0) return "seguimiento";
  return "pendiente";
}

export type FilaOrdenTestimonio = { estado: EstadoTestimonio; nombre: string; ultimoEnvio: number | null; ultimoComentario: number | null };

const GRUPO: Record<EstadoTestimonio, number> = { seguimiento: 0, pendiente: 1, realizado: 2 };

/**
 * Orden de "Todos": Seguimiento primero (el comentario más reciente primero), luego Pendientes
 * (alfabético) y al final Realizados (el envío más reciente primero). Las vistas filtradas tienen un solo
 * grupo y quedan con ese mismo criterio. Se mantiene con búsqueda, filtro de ciudad y refresco.
 */
export function compararTestimonios(a: FilaOrdenTestimonio, b: FilaOrdenTestimonio): number {
  const g = GRUPO[a.estado] - GRUPO[b.estado];
  if (g !== 0) return g;
  const d = a.estado === "seguimiento" ? (b.ultimoComentario ?? 0) - (a.ultimoComentario ?? 0)
    : a.estado === "realizado" ? (b.ultimoEnvio ?? 0) - (a.ultimoEnvio ?? 0) : 0;
  return d !== 0 ? d : a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
}
