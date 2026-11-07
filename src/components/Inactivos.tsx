"use client";

// Piezas compartidas del estado activo/inactivo en los paneles: filtro "Mostrar inactivos", etiqueta "Inactivo",
// casilla "Incluir inactivos" de las exportaciones y el diálogo de inactivar / reactivar
// (solo lo abre el admin; el servidor vuelve a exigir el permiso).
import { useEffect, useRef, useState } from "react";
import { MOTIVO_MAX, MOTIVO_MIN, type InfoInactivo } from "@/lib/activo";
import s from "./Inactivos.module.css";

export const estilosInactivos = s;

export function FiltroInactivos({ valor, onCambio, cuantos }: { valor: boolean; onCambio: (v: boolean) => void; cuantos?: number }) {
  return (
    <label className={s.filtro}>
      <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
      Mostrar inactivos{typeof cuantos === "number" && <span className={s.cuenta}>({cuantos})</span>}
    </label>
  );
}

/** Casilla junto a un botón de exportar: por defecto los inactivos no salen. */
export function IncluirInactivos({ valor, onCambio }: { valor: boolean; onCambio: (v: boolean) => void }) {
  return (
    <label className={s.incluir}>
      <input type="checkbox" checked={valor} onChange={(e) => onCambio(e.target.checked)} />
      Incluir inactivos
    </label>
  );
}

const fechaCorta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" }) : "";

export function EtiquetaInactivo({ info }: { info: InfoInactivo | undefined }) {
  if (!info) return null;
  const titulo = [info.motivo && `Motivo: ${info.motivo}`, info.por && `Por: ${info.por}`, info.en && fechaCorta(info.en)].filter(Boolean).join(" · ");
  return <span className={s.etiqueta} title={titulo || undefined}>Inactivo</span>;
}

/** Parámetro de las exportaciones: "inactivos=1" si se marcó incluirlos. */
export const paramInactivos = (incluir: boolean, sep: "?" | "&" = "&") => (incluir ? `${sep}inactivos=1` : "");

export type Persona = { documento: string; nombre: string; inactivo: InfoInactivo | undefined };

/**
 * Diálogo para inactivar (motivo obligatorio) o reactivar. Llama a POST /api/admin/estudiantes/activo.
 * onListo recibe el nuevo estado para que el panel recargue.
 */
export function DialogoActivo({ persona, onCerrar, onListo }: { persona: Persona; onCerrar: () => void; onListo: (activo: boolean) => void }) {
  const inactivar = !persona.inactivo;
  const [motivo, setMotivo] = useState("");
  const [intentado, setIntentado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;
  const ocupado = useRef(false);
  ocupado.current = enviando;
  const corto = motivo.trim().length < MOTIVO_MIN;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("textarea, [data-principal]")?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !ocupado.current) cerrar.current(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, []);

  async function confirmar() {
    setIntentado(true);
    if (inactivar && corto) return;
    setEnviando(true);
    setError("");
    try {
      const res = await fetch("/api/admin/estudiantes/activo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento: persona.documento, activo: !inactivar, ...(inactivar ? { motivo: motivo.trim() } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error(body.mensaje ?? (res.status === 403 ? "No tienes permiso para cambiar el estado." : ""));
      onListo(!inactivar);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo guardar. Intenta otra vez.");
      setEnviando(false);
    }
  }

  return (
    <div className={s.fondo} onMouseDown={(e) => { if (e.target === e.currentTarget && !enviando) onCerrar(); }}>
      <div className={s.dialogo} role="dialog" aria-modal="true" aria-labelledby="dlg-activo-titulo" ref={ref}>
        <h2 id="dlg-activo-titulo">{inactivar ? `Inactivar a ${persona.nombre}` : `Reactivar a ${persona.nombre}`}</h2>
        {inactivar ? (
          <>
            <p>Deja de contar en los totales y porcentajes de todos los módulos y no sale en las exportaciones. Si entra con su documento a validación o a la clausura, verá &quot;Escríbele a tu monitor&quot;. Lo puedes reactivar cuando quieras.</p>
            <label className="label" htmlFor="dlg-motivo" style={{ marginTop: 14, display: "block" }}>Motivo (obligatorio)</label>
            <textarea id="dlg-motivo" className={`input ${intentado && corto ? "is-error" : ""}`} maxLength={MOTIVO_MAX} value={motivo}
              onChange={(e) => setMotivo(e.target.value)} aria-invalid={intentado && corto} aria-describedby="dlg-motivo-ayuda" />
            <span id="dlg-motivo-ayuda" className={s.ayuda}>{intentado && corto ? "Escribe el motivo para inactivar." : "Ejemplo: se retiró del programa."}</span>
          </>
        ) : (
          <>
            <p>Vuelve a contar en todos los módulos y a salir en las exportaciones.</p>
            {persona.inactivo && (persona.inactivo.motivo || persona.inactivo.por) && (
              <div className={s.detalle}>
                {persona.inactivo.motivo && <div><b>Motivo:</b> {persona.inactivo.motivo}</div>}
                {persona.inactivo.por && <div>Inactivado por {persona.inactivo.por}{persona.inactivo.en ? ` · ${fechaCorta(persona.inactivo.en)}` : ""}</div>}
              </div>
            )}
          </>
        )}
        {error && <div className={s.error} role="alert">{error}</div>}
        <div className={s.acciones}>
          <button type="button" className="btn btn-soft" onClick={onCerrar} disabled={enviando}>Cancelar</button>
          <button type="button" className="btn btn-primary" data-principal onClick={confirmar} disabled={enviando}>
            {enviando ? "Guardando…" : inactivar ? "Inactivar" : "Reactivar"}
          </button>
        </div>
      </div>
    </div>
  );
}
