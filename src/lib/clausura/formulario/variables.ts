// Textos con variables: {evento}, {fecha}, {hora}, {llegada} (hora de citación) y {lugar} se reemplazan con los datos del evento al mostrarlos.
// Así el mismo formulario sirve para Cali (EXPOFeria y clausura) y Cartagena (clausura) sin repetir textos.
import type { Formulario } from "./esquema";

export type Variables = Record<"evento" | "fecha" | "hora" | "llegada" | "lugar", string>;

export const reemplazar = (t: string, v: Variables) => t.replace(/\{(evento|fecha|hora|llegada|lugar)\}/g, (_, k: keyof Variables) => v[k]);

/** Copia del formulario con las variables reemplazadas en títulos, ayudas, textos y opciones. Los IDs no cambian. */
export function resolverTextos(f: Formulario, v: Variables): Formulario {
  const r = (t: string | undefined) => (t === undefined ? t : reemplazar(t, v));
  return {
    secciones: f.secciones.map((s) => ({
      ...s, titulo: r(s.titulo)!, descripcion: r(s.descripcion),
      items: s.items.map((i) => i.tipo === "info"
        ? { ...i, titulo: r(i.titulo), texto: r(i.texto) }
        : { ...i, titulo: r(i.titulo)!, ayuda: r(i.ayuda), opciones: i.opciones?.map((o) => ({ ...o, texto: r(o.texto)! })) }),
    })),
  };
}
