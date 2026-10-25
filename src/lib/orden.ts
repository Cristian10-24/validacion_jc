// Orden de la lista de estudiantes (panel del monitor, coordinación y administración).
// Un solo comparador para todos los filtros, así el orden se mantiene con la búsqueda,
// el filtro de ciudad y el refresco automático:
//   1. Corregidos (por aprobar): el más reciente primero.
//   2. Validados: el más reciente primero.
//   3. Pendientes: en orden alfabético.
// Las vistas filtradas por estado tienen un solo grupo: "Corregido" y "Validado" quedan del más
// reciente al más antiguo y "Pendiente" en orden alfabético.

export type FilaOrdenable = { estado: "pendiente" | "corregido" | "validado"; nombre: string; nombrePropuesto?: string | null; fecha: string | null };

const GRUPO: Record<FilaOrdenable["estado"], number> = { corregido: 0, validado: 1, pendiente: 2 };
const nombreDe = (r: FilaOrdenable) => r.nombrePropuesto ?? r.nombre;
const ms = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export function compararFilas(a: FilaOrdenable, b: FilaOrdenable): number {
  const g = GRUPO[a.estado] - GRUPO[b.estado];
  if (g !== 0) return g;
  if (a.estado !== "pendiente") {
    const d = ms(b.fecha) - ms(a.fecha); // más reciente primero
    if (d !== 0) return d;
  }
  return nombreDe(a).localeCompare(nombreDe(b), "es", { sensitivity: "base" });
}
