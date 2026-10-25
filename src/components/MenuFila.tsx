"use client";

import { useEffect, useRef } from "react";
import s from "./MenuFila.module.css";

export type ItemMenu = { label: string; on: () => void };

/** Menú "⋯" de una fila: acciones secundarias. No se muestra si no hay acciones. */
export default function MenuFila({ abierto, onToggle, onCerrar, items, nombre }: {
  abierto: boolean; onToggle: () => void; onCerrar: () => void; items: ItemMenu[]; nombre: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // El padre pasa una función nueva en cada render (p. ej. con el refresco cada 30 s): se guarda en un ref
  // para no volver a registrar los listeners ni mover el foco mientras el menú está abierto.
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) cerrar.current(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar.current(); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("touchstart", fuera);
    document.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("touchstart", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  if (items.length === 0) return null;
  return (
    <div className={s.wrap} ref={ref}>
      <button type="button" className={`${s.dots} ${abierto ? s.dotsOn : ""}`} onClick={onToggle} aria-haspopup="menu" aria-expanded={abierto} aria-label={`Más acciones para ${nombre}`} title="Más acciones">
        ⋯
      </button>
      {abierto && (
        <div className={s.menu} role="menu">
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" className={s.item} onClick={() => { onCerrar(); it.on(); }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
