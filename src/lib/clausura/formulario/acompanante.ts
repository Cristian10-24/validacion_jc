// Acompañante según el evento (campo `acompanante`):
//  "si" → el formulario queda tal cual (la sección de acompañante aparece si el formulario la tiene).
//  "no" → la sección de acompañante no aparece: se archiva en el formulario que se responde y los saltos que
//         iban a ella siguen a donde iba después de ella. Las preguntas y respuestas guardadas no se borran.
// Los eventos sin el campo cuentan como "si" (igual que antes). Función pura: servidor y navegador usan el mismo
// formulario resultante.
import type { Destino, Formulario, Seccion } from "./esquema";

export const MODOS_ACOMPANANTE = ["si", "no"] as const;
export type ModoAcompanante = (typeof MODOS_ACOMPANANTE)[number];

/** ¿Es la sección de acompañante? (por su ID o su título, como en los formularios de Cali y Cartagena) */
export const esSeccionAcompanante = (s: Pick<Seccion, "id" | "titulo">) => /acompa/i.test(s.id) || /acompañante/i.test(s.titulo);

export function aplicarAcompanante(f: Formulario, modo: ModoAcompanante): Formulario {
  if (modo === "si") return f;
  const quitar = new Set(f.secciones.filter((s) => !s.archivada && esSeccionAcompanante(s)).map((s) => s.id));
  if (!quitar.size) return f;

  // A dónde se sigue en lugar de la sección quitada: su "despues" o la sección que viene a continuación.
  const reemplazo = (id: string, vistos = new Set<string>()): Destino => {
    const i = f.secciones.findIndex((s) => s.id === id);
    const s = f.secciones[i]!;
    let d: Destino = s.despues && s.despues !== "siguiente" ? s.despues : (f.secciones[i + 1] ? { seccion: f.secciones[i + 1]!.id } : "enviar");
    if (typeof d === "object" && quitar.has(d.seccion) && !vistos.has(d.seccion)) d = reemplazo(d.seccion, new Set([...vistos, id]));
    return d;
  };
  const cambiar = (d: Destino | undefined): Destino | undefined => (d && typeof d === "object" && quitar.has(d.seccion) ? reemplazo(d.seccion) : d);

  return {
    secciones: f.secciones.map((s) => {
      if (quitar.has(s.id)) return { ...s, archivada: true };
      const items = s.items.map((it) => ("opciones" in it && it.opciones?.some((o) => o.irA)
        ? { ...it, opciones: it.opciones.map((o) => (o.irA ? { ...o, irA: cambiar(o.irA) } : o)) }
        : it));
      return { ...s, items, ...(s.despues ? { despues: cambiar(s.despues) } : {}) };
    }),
  };
}
