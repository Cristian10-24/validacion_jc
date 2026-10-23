import type { Student } from "./types";
import { checkEmail } from "./validation/email";
import { nameWarnings } from "./validation/name";

/** Lo único que ve el estudiante de su registro. */
export function studentView(s: Student) {
  // Si ya envió una corrección, ve lo que envió (pendiente de revisión del monitor).
  const nombre = s.nombrePropuesto ?? s.nombre;
  const correo = s.correoPropuesto ?? s.correo;
  const email = checkEmail(correo);
  return {
    id: s._id.toHexString(),
    estado: s.estado,
    nombre,
    correo,
    avisos: {
      nombre: nameWarnings(nombre),
      correoInvalido: !email.valid,
      correoEducativo: email.educational,
      sugerencia: email.suggestion,
    },
  };
}

export type StudentView = ReturnType<typeof studentView>;
