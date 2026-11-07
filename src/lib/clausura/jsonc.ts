// Lectura de JSON con comentarios (los archivos de eventos/ y docs/clausura/ejemplo-evento.jsonc).

/** Quita los comentarios // y /* *\/ que estén fuera de las cadenas. */
export function sinComentarios(t: string): string {
  let out = "", i = 0, enCadena = false;
  while (i < t.length) {
    const ch = t[i]!;
    if (enCadena) {
      out += ch;
      if (ch === "\\") { out += t[i + 1] ?? ""; i += 2; continue; }
      if (ch === '"') enCadena = false;
      i++;
    } else if (ch === '"') { enCadena = true; out += ch; i++; }
    else if (ch === "/" && t[i + 1] === "/") { while (i < t.length && t[i] !== "\n") i++; }
    else if (ch === "/" && t[i + 1] === "*") { i += 2; while (i < t.length && !(t[i] === "*" && t[i + 1] === "/")) i++; i += 2; }
    else { out += ch; i++; }
  }
  return out.replace(/,(\s*[}\]])/g, "$1"); // comas finales
}
