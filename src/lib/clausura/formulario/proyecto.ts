// Sección del proyecto según el evento (campo `proyecto`):
//  "obligatorio" → la sección del proyecto aparece tal cual y sus preguntas obligatorias se exigen (Cali).
//  "opcional"    → antes se pregunta "¿Vas a presentar tu proyecto en la EXPOFeria?" (Sí/No); los datos solo si es Sí.
//  "no"          → no aparece nada del proyecto (Cartagena).
// La sección del proyecto se marca en el formulario con "proyecto": true. Función pura: el servidor y el navegador
// usan el mismo formulario resultante.
import type { Condicion, Formulario, Item } from "./esquema";

export const MODOS_PROYECTO = ["obligatorio", "opcional", "no"] as const;
export type ModoProyecto = (typeof MODOS_PROYECTO)[number];

/** Pregunta que se agrega en modo "opcional" (ID fijo, para el panel y el Excel). */
export const ID_PRESENTA_PROYECTO = "q_presenta_proyecto";
export const TEXTO_PRESENTA_PROYECTO = "¿Vas a presentar tu proyecto en la EXPOFeria?";

export function aplicarProyecto(f: Formulario, modo: ModoProyecto): Formulario {
  if (modo === "obligatorio") return f;
  if (modo === "no") return { secciones: f.secciones.filter((s) => !s.proyecto) };
  const si: Condicion = { pregunta: ID_PRESENTA_PROYECTO, op: "=", valor: "si" };
  return {
    secciones: f.secciones.map((s) => {
      if (!s.proyecto) return s;
      const items: Item[] = s.items.map((i) => {
        // Los bloques informativos del inicio se dejan visibles; lo demás solo si va a presentar.
        if (i.tipo === "info" && !i.mostrarSi) return i;
        const previas = i.mostrarSi ? (Array.isArray(i.mostrarSi) ? i.mostrarSi : [i.mostrarSi]) : [];
        return { ...i, mostrarSi: [si, ...previas] };
      });
      const pregunta: Item = { id: ID_PRESENTA_PROYECTO, tipo: "sino", titulo: TEXTO_PRESENTA_PROYECTO, obligatoria: true };
      const primeraNoInfo = items.findIndex((i) => i.tipo !== "info" || !!i.mostrarSi);
      items.splice(primeraNoInfo < 0 ? items.length : primeraNoInfo, 0, pregunta);
      return { ...s, items };
    }),
  };
}
