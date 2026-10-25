// Orden de la lista de estudiantes (panel del monitor, coordinación y administración).
// Un solo comparador para todos los filtros, así el orden se mantiene con la búsqueda,
// el filtro de ciudad y el refresco automático:
//   - Validados y corregidos: el más reciente primero (fecha de su última validación o corrección).
//   - Pendientes: al final, en orden alfabético.
// Con el filtro "Validado" o "Corregido" queda del más reciente al más antiguo;
// con "Pendiente", alfabético; con "Todos", primero los recientes y al final los pendientes.

export type FilaOrdenable = { estado: "pendiente" | "corregido" | "validado"; nombre: string; nombrePropuesto?: string | null; fecha: string | null };

const nombreDe = (r: FilaOrdenable) => r.nombrePropuesto ?? r.nombre;
const ms = (iso: string | null) => (iso ? Date.parse(iso) || 0 : 0);

export function compararFilas(a: FilaOrdenable, b: FilaOrdenable): number {
  const pa = a.estado === "pendiente", pb = b.estado === "pendiente";
  if (pa !== pb) return pa ? 1 : -1; // pendientes al final
  if (!pa) {
    const d = ms(b.fecha) - ms(a.fecha); // más reciente primero
    if (d !== 0) return d;
  }
  return nombreDe(a).localeCompare(nombreDe(b), "es", { sensitivity: "base" });
}
