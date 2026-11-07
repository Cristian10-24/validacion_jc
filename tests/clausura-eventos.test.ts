import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EventoArchivo, revisarEventoArchivo } from "@/lib/clausura/evento";
import { validarFormulario } from "@/lib/clausura/formulario/motor";
import { sinComentarios } from "@/lib/clausura/jsonc";

// Los archivos de eventos/ y el ejemplo comentado de docs/ deben pasar las mismas reglas que el script.
const RAIZ = path.resolve(__dirname, "..");
const archivos = [
  ...readdirSync(path.join(RAIZ, "eventos")).filter((f) => f.endsWith(".json")).map((f) => path.join("eventos", f)),
  path.join("docs", "clausura", "ejemplo-evento.jsonc"),
];

describe("archivos de eventos", () => {
  it.each(archivos)("%s es válido", (f) => {
    const e = EventoArchivo.parse(JSON.parse(sinComentarios(readFileSync(path.join(RAIZ, f), "utf8"))));
    expect([...validarFormulario(e.formulario), ...revisarEventoArchivo(e)]).toEqual([]);
  });
  it("el ejemplo muestra todos los tipos de pregunta y de condición", () => {
    const t = readFileSync(path.join(RAIZ, "docs", "clausura", "ejemplo-evento.jsonc"), "utf8");
    for (const tipo of ["texto", "parrafo", "unica", "casillas", "desplegable", "sino", "numero", "fecha", "telefono", "info"]) expect(t).toContain(`"tipo": "${tipo}"`);
    for (const op of ["=", "!=", "incluye"]) expect(t).toContain(`"op": "${op}"`);
    expect(t).toContain('"irA": "enviar"');
    expect(t).toContain('"irA": { "seccion"');
  });
  it("sinComentarios respeta las URLs dentro de los textos", () => {
    expect(JSON.parse(sinComentarios('{ "a": "https://x.org/y", // nota\n "b": 1, }'))).toEqual({ a: "https://x.org/y", b: 1 });
  });
  it("los eventos de ejemplo quedan en borrador (se publican con --estado=abierto)", () => {
    for (const f of archivos.filter((x) => x.startsWith("eventos"))) expect(JSON.parse(readFileSync(path.join(RAIZ, f), "utf8")).estado).toBe("borrador");
  });
});
