import { describe, expect, it } from "vitest";
import { Formulario } from "@/lib/clausura/formulario/esquema";
import {
  camino, limpiar, siguienteSeccion, usadosEn, validarCambioFormulario, validarFormulario, validarRespuestas,
} from "@/lib/clausura/formulario/motor";
import { ocultarCelular, ocultarCorreo, validarTelefono } from "@/lib/clausura/contacto";

// Formulario de prueba con ramas:
//   s_asis: ¿Asistirás? sí → s_det (y luego salta a s_expo) · no → s_motivo (y envía) · tal vez → enviar ya.
const F = Formulario.parse({
  secciones: [
    { id: "s_asis", titulo: "Asistencia", items: [
      { id: "info_1", tipo: "info", texto: "Te esperamos." },
      { id: "q_asiste", tipo: "unica", titulo: "¿Asistirás?", obligatoria: true, opciones: [
        { id: "si", texto: "Sí" },
        { id: "no", texto: "No", irA: { seccion: "s_motivo" } },
        { id: "tal_vez", texto: "Tal vez", irA: "enviar" },
      ] },
    ] },
    { id: "s_det", titulo: "Detalles", despues: { seccion: "s_expo" }, items: [
      { id: "q_acomp", tipo: "sino", titulo: "¿Vienes con acompañantes?", obligatoria: true },
      { id: "q_cuantos", tipo: "numero", titulo: "¿Cuántos?", obligatoria: true, entero: true, min: 1, max: 3, mostrarSi: { pregunta: "q_acomp", op: "=", valor: "si" } },
      { id: "q_comida", tipo: "casillas", titulo: "Comida", obligatoria: true, opciones: [{ id: "veg", texto: "Vegetariana" }, { id: "otra", texto: "Otra" }] },
      { id: "q_cual", tipo: "texto", titulo: "¿Cuál?", obligatoria: true, mostrarSi: { pregunta: "q_comida", op: "incluye", valor: "otra" } },
    ] },
    { id: "s_motivo", titulo: "Motivo", despues: "enviar", items: [
      { id: "q_motivo", tipo: "parrafo", titulo: "¿Por qué no puedes venir?", obligatoria: true },
    ] },
    { id: "s_expo", titulo: "Expoferia", mostrarSi: { pregunta: "q_asiste", op: "!=", valor: "no" }, items: [
      { id: "q_proyecto", tipo: "texto", titulo: "Nombre de tu proyecto" },
      { id: "q_fecha", tipo: "fecha", titulo: "Fecha de llegada" },
      { id: "q_tel", tipo: "telefono", titulo: "Teléfono de un acudiente" },
      { id: "q_viejo", tipo: "texto", titulo: "Archivada", archivada: true },
    ] },
  ],
});

const ids = (r: Record<string, unknown>) => camino(F, r as never).pasos.map((p) => p.seccion.id);

describe("camino: saltos por opción, ir a sección, enviar anticipado y mostrar solo si", () => {
  it("el formulario de prueba es coherente", () => expect(validarFormulario(F)).toEqual([]));
  it("sin responder: sigue el orden por defecto (y respeta 'despues' de la sección)", () => expect(ids({})).toEqual(["s_asis", "s_det", "s_expo"]));
  it("'Sí' → detalles → salta motivo → expoferia", () => expect(ids({ q_asiste: "si" })).toEqual(["s_asis", "s_det", "s_expo"]));
  it("'No' → ir a la sección de motivo → enviar", () => expect(ids({ q_asiste: "no" })).toEqual(["s_asis", "s_motivo"]));
  it("'Tal vez' → enviar anticipado", () => expect(ids({ q_asiste: "tal_vez" })).toEqual(["s_asis"]));
  it("mostrar solo si (=): '¿Cuántos?' aparece solo con acompañantes", () => {
    const det = (r: object) => camino(F, { q_asiste: "si", ...r } as never).pasos[1]!.items.map((i) => i.id);
    expect(det({ q_acomp: "no" })).not.toContain("q_cuantos");
    expect(det({ q_acomp: "si" })).toContain("q_cuantos");
  });
  it("mostrar solo si (incluye) en casillas", () => {
    const det = (comida: string[]) => camino(F, { q_asiste: "si", q_comida: comida }).pasos[1]!.items.map((i) => i.id);
    expect(det(["veg"])).not.toContain("q_cual");
    expect(det(["veg", "otra"])).toContain("q_cual");
  });
  it("las preguntas archivadas nunca son visibles", () => {
    expect(camino(F, { q_asiste: "si" }).pasos[2]!.items.map((i) => i.id)).not.toContain("q_viejo");
  });
  it("siguienteSeccion sigue el camino", () => {
    expect(siguienteSeccion(F, { q_asiste: "no" }, "s_asis")).toBe("s_motivo");
    expect(siguienteSeccion(F, { q_asiste: "no" }, "s_motivo")).toBeNull();
    expect(siguienteSeccion(F, { q_asiste: "si" }, "s_det")).toBe("s_expo");
  });
});

describe("limpiar: las respuestas de ramas ocultas se descartan", () => {
  it("cambiar de 'Sí' a 'No' borra lo de detalles y expoferia", () => {
    const r = limpiar(F, { q_asiste: "no", q_acomp: "si", q_cuantos: 2, q_comida: ["veg"], q_proyecto: "Robot", q_motivo: "Viaje" });
    expect(r).toEqual({ q_asiste: "no", q_motivo: "Viaje" });
  });
  it("sin acompañantes se borra '¿Cuántos?'; ids desconocidos y archivadas también", () => {
    const r = limpiar(F, { q_asiste: "si", q_acomp: "no", q_cuantos: 2, q_comida: ["veg"], inventada: "x", q_viejo: "y" });
    expect(r).toEqual({ q_asiste: "si", q_acomp: "no", q_comida: ["veg"] });
  });
  it("respuestas en blanco se descartan y los textos se recortan", () => {
    expect(limpiar(F, { q_asiste: "si", q_proyecto: "  Robot  ", q_acomp: "  " })).toEqual({ q_asiste: "si", q_proyecto: "Robot" });
  });
});

describe("validación con Zod generada desde el esquema", () => {
  it("una sección: solo exige sus preguntas visibles", () => {
    const v = validarRespuestas(F, { q_asiste: "si", q_acomp: "no" }, "s_det");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errores)).toEqual(["q_comida"]); // q_cuantos está oculta: no se exige
  });
  it("las obligatorias de ramas ocultas no se exigen al enviar", () => {
    const v = validarRespuestas(F, { q_asiste: "no", q_motivo: "Tengo un viaje" });
    expect(v).toEqual({ ok: true, respuestas: { q_asiste: "no", q_motivo: "Tengo un viaje" } });
  });
  it("enviar completo por la rama larga", () => {
    const v = validarRespuestas(F, { q_asiste: "si", q_acomp: "si", q_cuantos: "2", q_comida: ["otra"], q_cual: "Sin gluten", q_fecha: "2026-11-28", q_tel: "+57 300 111 2233" });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.respuestas.q_cuantos).toBe(2);
  });
  it("rechaza valores fuera de rango, opciones inventadas, fechas imposibles y teléfonos cortos", () => {
    const v = validarRespuestas(F, { q_asiste: "si", q_acomp: "si", q_cuantos: 9, q_comida: ["pizza"], q_fecha: "2026-02-30", q_tel: "123" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(Object.keys(v.errores).sort()).toEqual(["q_comida", "q_cuantos", "q_fecha", "q_tel"]);
  });
  it("opción que no existe en una pregunta de opción única", () => {
    const v = validarRespuestas(F, { q_asiste: "quizas" }, "s_asis");
    expect(v.ok).toBe(false);
  });
  it("una sección fuera del camino no se puede guardar", () => {
    const v = validarRespuestas(F, { q_asiste: "tal_vez" }, "s_det");
    expect(v.ok).toBe(false);
  });
});

describe("reglas de estructura del formulario", () => {
  const base = JSON.parse(JSON.stringify(F)) as Formulario;
  it("rechaza saltos hacia atrás o a secciones inexistentes", () => {
    const f = structuredClone(base);
    f.secciones[2]!.despues = { seccion: "s_asis" };
    f.secciones[1]!.despues = { seccion: "nada" };
    const e = validarFormulario(f);
    expect(e.some((x) => x.includes("posterior"))).toBe(true);
    expect(e.some((x) => x.includes("no existe"))).toBe(true);
  });
  it("rechaza condiciones sobre preguntas posteriores o con opciones inexistentes, e IDs repetidos", () => {
    const f = structuredClone(base);
    f.secciones[0]!.items[1]!.mostrarSi = { pregunta: "q_motivo", op: "=", valor: "x" };
    f.secciones[1]!.items[1]!.mostrarSi = { pregunta: "q_asiste", op: "=", valor: "quizas" };
    f.secciones[3]!.items[0]!.id = "q_motivo";
    const e = validarFormulario(f);
    expect(e.some((x) => x.includes("debe estar antes"))).toBe(true);
    expect(e.some((x) => x.includes("no es una opción"))).toBe(true);
    expect(e.some((x) => x.includes("ID repetido"))).toBe(true);
  });
});

describe("editar un formulario que ya tiene respuestas", () => {
  const usados = usadosEn([{ q_asiste: "no", q_motivo: "Viaje" }]);
  it("se puede cambiar el texto, agregar y archivar", () => {
    const f = structuredClone(F);
    f.secciones[0]!.items[1]!.titulo = "¿Vas a venir?";
    f.secciones[2]!.items[0]!.archivada = true;
    f.secciones[2]!.items.push({ id: "q_nueva", tipo: "texto", titulo: "Nueva", obligatoria: false });
    expect(validarCambioFormulario(F, f, usados)).toEqual([]);
  });
  it("no se puede borrar una pregunta u opción con respuestas, ni cambiar su tipo", () => {
    const f = structuredClone(F);
    f.secciones[2]!.items = [];
    const q = f.secciones[0]!.items[1]! as { opciones: { id: string }[] };
    q.opciones = q.opciones.filter((o) => o.id !== "no");
    expect(validarCambioFormulario(F, f, usados)).toHaveLength(2);
    const g = structuredClone(F);
    (g.secciones[2]!.items[0]! as { tipo: string }).tipo = "texto";
    expect(validarCambioFormulario(F, g, usados)[0]).toContain("tipo");
  });
});

describe("contacto: datos ocultos y celulares", () => {
  it("oculta el correo", () => {
    expect(ocultarCorreo("juanita@gmail.com")).toBe("ju•••••@gmail.com");
    expect(ocultarCorreo("jo@hotmail.com")).toBe("j•••••@hotmail.com");
  });
  it("oculta el celular (3 primeros y 2 últimos del número nacional)", () => {
    expect(ocultarCelular("3001112233", "Cali")).toBe("300 ••• •• 33");
    expect(ocultarCelular("+573001112233", "Cartagena")).toBe("300 ••• •• 33");
    expect(ocultarCelular("099123456", "Uruguay")).toBe("991 ••• •• 56");
  });
  it("valida celulares por país", () => {
    expect(validarTelefono("300 111 2233", "Cali")).toEqual({ ok: true, digitos: "3001112233" });
    expect(validarTelefono("+598 99 123 456", "Cali").ok).toBe(true);
    expect(validarTelefono("300 111 223", "Cali").ok).toBe(false);
    expect(validarTelefono("6123 4567", "Ciudad de Panamá").ok).toBe(true);
    expect(validarTelefono("abc", null).ok).toBe(false);
  });
});
