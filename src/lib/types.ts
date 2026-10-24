import type { ObjectId } from "mongodb";
import type { RolUsuario } from "./permisos";

export type Estado = "pendiente" | "corregido" | "validado";
export type Rol = "estudiante" | RolUsuario;

export type Actor = { rol: Rol; usuario?: string };

export type Student = {
  _id: ObjectId;
  documento: string;
  ciudad: string;
  grupo: string;
  monitorRef: string;
  nombreOriginal: string;
  correoOriginal: string;
  nombre: string;
  correo: string;
  correoNorm: string;
  nombrePropuesto?: string;
  correoPropuesto?: string;
  estado: Estado;
  aceptaCorreoPersonal: boolean;
  validadoPor?: Actor;
  validadoEn?: Date;
  creadoEn: Date;
  actualizadoEn: Date;
};

export type User = {
  _id: ObjectId;
  usuario: string;
  nombre: string;
  passwordHash: string;
  rol: RolUsuario;
  ciudades: string[];
  activo: boolean;
  /** Sube al restablecer la clave o desactivar: invalida las sesiones abiertas. */
  tokenVersion?: number;
  creadoEn: Date;
  actualizadoEn?: Date;
};

export type ChangeLog = {
  _id?: ObjectId;
  studentId: ObjectId;
  documento: string;
  campo: "nombre" | "correo" | "estado" | "documento" | "ciudad" | "grupo";
  anterior: string;
  nuevo: string;
  actor: Actor;
  accion: "confirmar" | "corregir" | "aprobar" | "editar" | "validar_en_nombre" | "importar" | "eliminar" | "editar_admin";
  fecha: Date;
};

export type RateLimit = { _id: string; count: number; expiraEn: Date };
