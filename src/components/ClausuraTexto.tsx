// Texto con formato básico, sin HTML: párrafos (línea en blanco), listas ("- "), **negrita**, *cursiva* y
// [enlace](https://…). Se convierte a elementos de React: nunca se inyecta HTML.
import type { ReactNode } from "react";

const TOKEN = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https:\/\/[^)\s]+\))/g;

function linea(texto: string, k: string): ReactNode[] {
  return texto.split(TOKEN).filter(Boolean).map((parte, i) => {
    const key = `${k}-${i}`;
    if (parte.startsWith("**") && parte.endsWith("**")) return <strong key={key}>{parte.slice(2, -2)}</strong>;
    if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) return <em key={key}>{parte.slice(1, -1)}</em>;
    const m = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/.exec(parte);
    if (m) return <a key={key} href={m[2]} target="_blank" rel="noreferrer">{m[1]}</a>;
    return parte;
  });
}

export default function ClausuraTexto({ texto, className }: { texto: string; className?: string }) {
  const bloques = texto.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={className}>
      {bloques.map((b, i) => {
        const lineas = b.split("\n");
        if (lineas.every((l) => /^\s*-\s+/.test(l))) {
          return <ul key={i}>{lineas.map((l, j) => <li key={j}>{linea(l.replace(/^\s*-\s+/, ""), `${i}-${j}`)}</li>)}</ul>;
        }
        return <p key={i}>{lineas.flatMap((l, j) => (j ? [<br key={`br${j}`} />, ...linea(l, `${i}-${j}`)] : linea(l, `${i}-${j}`)))}</p>;
      })}
    </div>
  );
}
