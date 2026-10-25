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
  | "exportar_pendientes";

const PERMISOS: Record<RolUsuario, readonly Permiso[]> = {
  monitor: [],
  coordinador: ["ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "ver_historial"],
  admin: ["ver_todas_las_ciudades", "ver_resumen", "descargar_excel", "ver_historial", "subir_lista", "gestionar_usuarios", "editar_todo", "exportar_pendientes"],
};

export function puede(rol: string | undefined, permiso: Permiso): boolean {
  return !!rol && (PERMISOS[rol as RolUsuario] ?? []).includes(permiso);
}

export const ROL_TXT: Record<RolUsuario, string> = { monitor: "Monitor", coordinador: "Coordinación", admin: "Administración" };

/** Página de inicio después del login. */
export const inicioPorRol = (rol: string) => (puede(rol, "ver_resumen") ? "/admin" : "/monitor");
