// Roles y permisos. Es la única fuente de verdad: el servidor valida con estas funciones
// y la interfaz las usa solo para mostrar u ocultar botones.
//
//  monitor      → solo sus ciudades: aprobar, corregir nombre/correo, validar por el estudiante.
//  coordinador  → todas las ciudades: lo mismo que un monitor + resumen, historial y Excel final.
//  admin        → todo lo del coordinador + subir lista, gestionar usuarios y editar todos los campos.

export const ROLES = ["monitor", "coordinador", "admin"] as const;
export type RolUsuario = (typeof ROLES)[number];

export type Permiso =
  | "ver_todas_las_ciudades"
  | "ver_resumen"
  | "descargar_excel"
  | "ver_historial"
  | "subir_lista"
  | "gestionar_usuarios"
  | "editar_todo"
  | "exportar_pendientes"
  // Módulo de testimonios
  | "testimonios_ver"          // monitor: sus ciudades; coordinación y admin: todas
  | "testimonios_comentar"
  | "testimonios_subir_lista"
  | "testimonios_sin_duenio"   // ver, asignar y descartar respuestas sin dueño
  | "testimonios_exportar_pendientes" // Excel de pendientes: monitor solo sus ciudades
  | "testimonios_resumen"             // avance por ciudad (coordinación y admin)
  // Módulo "Encuesta final" (usa la lista de participantes de testimonios; mismos roles que su equivalente)
  | "encuesta_ver"                    // monitor: sus ciudades; coordinación y admin: todas
  | "encuesta_comentar"
  | "encuesta_resumen"                // avance por ciudad (coordinación y admin)
  | "encuesta_sin_coincidencia"       // respuestas que no coinciden con ningún participante (admin)
  // Módulo "Clausura y Expoferia" (lista de students; monitor solo sus ciudades)
  | "clausura_ver"                    // monitor: sus ciudades; coordinación y admin: todas
  | "clausura_comentar"
  | "clausura_exportar"               // Excel de respuestas: monitor solo sus ciudades
  | "clausura_resumen"                // avance por ciudad (monitor: solo sus ciudades; coordinación y admin: todas)
  | "clausura_gestionar";              // crear/editar eventos, abrir/cerrar, reabrir respuestas (solo admin)

const ENCUESTA_MONITOR: readonly Permiso[] = ["encuesta_ver", "encuesta_comentar"];
const CLAUSURA_TODOS: readonly Permiso[] = ["clausura_ver", "clausura_comentar", "clausura_exportar", "clausura_resumen"];

const PERMISOS: Record<RolUsuario, readonly Permiso[]> = {
  monitor: ["testimonios_ver", "testimonios_comentar", "testimonios_exportar_pendientes", ...ENCUESTA_MONITOR, ...CLAUSURA_TODOS],
  coordinador: ["ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "ver_historial", "testimonios_ver", "testimonios_comentar", "testimonios_exportar_pendientes", "testimonios_resumen",
    ...ENCUESTA_MONITOR, "encuesta_resumen", ...CLAUSURA_TODOS],
  admin: ["ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "ver_historial", "subir_lista", "gestionar_usuarios", "editar_todo", "exportar_pendientes",
    "testimonios_ver", "testimonios_comentar", "testimonios_subir_lista", "testimonios_sin_duenio", "testimonios_exportar_pendientes", "testimonios_resumen",
    ...ENCUESTA_MONITOR, "encuesta_resumen", "encuesta_sin_coincidencia", ...CLAUSURA_TODOS, "clausura_gestionar"],
};

export function puede(rol: string | undefined, permiso: Permiso): boolean {
  return !!rol && (PERMISOS[rol as RolUsuario] ?? []).includes(permiso);
}

export const ROL_TXT: Record<RolUsuario, string> = { monitor: "Monitor", coordinador: "Coordinación", admin: "Administración" };

/** Página de inicio después del login. */
export const inicioPorRol = (rol: string) => (puede(rol, "ver_resumen") ? "/admin" : "/monitor");
