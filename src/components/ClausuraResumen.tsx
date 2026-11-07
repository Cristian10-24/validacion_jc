"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ResumenClausura } from "@/lib/clausura/resumen";
import AppShell from "./AppShell";
import s from "./AdminOverview.module.css";

// Avance de la clausura por ciudad, con el mismo estilo del resumen de certificados.

const REFRESCO_MS = 30_000;
const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
const colorAvance = (p: number) => (p >= 85 ? "var(--green)" : p >= 65 ? "var(--yellow)" : "var(--red)");
/** Etiqueta corta de una opción de asistencia a partir de su ID estable ("si" → Sí, "inconvenientes" → Inconvenientes). */
export const etiquetaCorta = (id: string) => (id === "si" ? "Sí" : id === "no" ? "No" : id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " "));

export async function descargarExcel(evento: string, sinResponder: boolean): Promise<{ archivo: string; filas: number }> {
  const res = await fetch(`/api/clausura/exportar?evento=${encodeURIComponent(evento)}${sinResponder ? "&sinResponder=1" : ""}`, { cache: "no-store" });
  if (!res.ok) throw new Error();
  const archivo = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "clausura.xlsx";
  const filas = Number(res.headers.get("X-Filas") ?? 0);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: archivo });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { archivo, filas };
}

export default function ClausuraResumen({ user }: { user: SessionUser }) {
  const [data, setData] = useState<ResumenClausura | null>(null);
  const [error, setError] = useState(false);
  const [sinResponder, setSinResponder] = useState(true);
  const [dl, setDl] = useState<{ estado: "idle" | "loading" | "error" } | { estado: "done"; archivo: string; filas: number }>({ estado: "idle" });

  async function cargar(silencioso = false) {
    try {
      const res = await fetch("/api/clausura/resumen", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      if (!silencioso) setError(true);
    }
  }
  useEffect(() => {
    cargar();
    const tick = setInterval(() => { if (document.visibilityState === "visible") cargar(true); }, REFRESCO_MS);
    return () => clearInterval(tick);
  }, []);

  async function descargar() {
    setDl({ estado: "loading" });
    try { setDl({ estado: "done", ...(await descargarExcel("todos", sinResponder)) }); } catch { setDl({ estado: "error" }); }
  }

  const t = data?.total;
  const ciudades = [...(data?.ciudades ?? [])].sort((a, b) => pct(a.respondio, a.total) - pct(b.respondio, b.total) || a.ciudad.localeCompare(b.ciudad, "es"));
  const hora = data ? new Date(data.actualizado).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "";

  return (
    <AppShell user={user} active="clausura_resumen">
      <div className={s.top}>
        <section className={s.hero} aria-label="Avance total">
          <i className={s.heroRing} aria-hidden />
          <div className={s.heroKicker}>Clausura · avance total</div>
          <div className={s.heroNum}>
            <span className={s.heroPct}>{t ? `${Math.round(pct(t.respondio, t.total))}%` : "–"}</span>
            <span className={s.heroOf}>{t ? `${t.respondio} de ${t.total} respondieron` : "Cargando…"}</span>
          </div>
          <div className={s.heroBar} aria-hidden>
            <i style={{ width: `${t ? pct(t.respondio, t.total) : 0}%`, background: "#3DD598" }} />
            <i style={{ width: `${t ? pct(t.enProgreso, t.total) : 0}%`, background: "var(--yellow)" }} />
          </div>
          {t && (
            <div className={s.legend}>
              <span><i className={s.dot} style={{ background: "#3DD598" }} />{t.respondio} respondieron</span>
              <span><i className={s.dot} style={{ background: "var(--yellow)" }} />{t.enProgreso} en progreso</span>
              <span><i className={s.dot} style={{ background: "#FF7A85" }} />{t.sinResponder} sin responder</span>
            </div>
          )}
        </section>

        <section className={s.final}>
          <div className={s.finalTitle}>Respuestas en Excel</div>
          <div className={s.finalText}>Una fila por estudiante y una columna por pregunta, de todos los eventos. Incluye la hoja &quot;Preguntas&quot;.</div>
          <label className={s.finalText} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={sinResponder} onChange={(e) => setSinResponder(e.target.checked)} /> Incluir a quienes no han respondido
          </label>
          <div style={{ flex: 1 }} />
          {dl.estado === "error" && <div className={s.errBox}>No pudimos generar el archivo. Intenta otra vez.</div>}
          {dl.estado === "done" ? (
            <div className={s.done}>
              <div><div className={s.doneTitle}>Descargado ✓ · {dl.filas} filas</div><div className={s.doneFile}>{dl.archivo}</div></div>
              <button type="button" className={s.doneBtn} onClick={() => setDl({ estado: "idle" })}>Otra vez</button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary" onClick={descargar} disabled={!t || dl.estado === "loading"}>
              {dl.estado === "loading" ? <><span className="spinner-sm" />Generando Excel…</> : "Descargar respuestas"}
            </button>
          )}
        </section>
      </div>

      <div className={s.citiesHead}>
        <div className={s.citiesTitle}>Por ciudad</div>
        <div className={s.scale}>
          <span><i className={s.dot} style={{ background: "var(--green)" }} />≥ 85%</span>
          <span><i className={s.dot} style={{ background: "var(--yellow)" }} />65–84%</span>
          <span><i className={s.dot} style={{ background: "var(--red)" }} />&lt; 65%</span>
        </div>
      </div>
      {data && <div className={s.updated}>De menor a mayor avance · actualizado {hora} · se actualiza solo cada 30 s</div>}

      <div className={s.tHead}><span>Ciudad</span><span>Avance</span><span>%</span><span>Respondieron</span><span>En progreso</span><span>Sin responder</span><span>Asistencia</span></div>
      {error && !data && <div className={s.errBox} style={{ marginTop: 12 }}>No pudimos cargar el avance. <button type="button" className="btn-link" onClick={() => cargar()}>Intentar de nuevo</button></div>}
      {!data && !error && <div className={s.skeleton}>{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div>}
      {data && ciudades.length === 0 && <div className={s.updated} style={{ marginTop: 16 }}>Todavía no hay eventos abiertos o cerrados.</div>}
      {ciudades.map((c) => {
        const p = pct(c.respondio, c.total);
        return (
          <a key={`${c.evento.id}-${c.ciudad}`} className={s.city} href={`/clausura/panel?evento=${c.evento.id}&ciudad=${encodeURIComponent(c.ciudad)}`} title={`Ver respuestas de ${c.ciudad}`}>
            <div className={s.cName}>{c.ciudad}<span className={s.numLabel} style={{ display: "block", fontWeight: 500, fontSize: 12.5, color: "var(--muted)" }}>{c.evento.titulo}{c.evento.estado === "cerrado" ? " · cerrado" : ""}</span></div>
            <div className={s.cBar} aria-hidden>
              <i style={{ width: `${p}%`, background: colorAvance(p) }} />
              <i style={{ width: `${pct(c.enProgreso, c.total)}%`, background: "var(--yellow-soft)" }} />
            </div>
            <div className={s.cPct}>{Math.round(p)}%</div>
            <div className={s.cNums}>
              <span><b>{c.respondio}</b> / {c.total}<span className={s.numLabel}> respondieron</span></span>
              <span><b>{c.enProgreso}</b><span className={s.numLabel}> en progreso</span></span>
              <span><b>{c.sinResponder}</b><span className={s.numLabel}> sin responder</span></span>
            </div>
            <div className={s.cMon} title={c.asistencia.map((a) => `${a.texto}: ${a.n}`).join(" · ")}>
              {c.asistencia.map((a) => `${etiquetaCorta(a.id)}: ${a.n}`).join(" · ") || "—"}
              {c.presentanProyecto !== null ? ` · Proyecto: ${c.presentanProyecto}` : ""}
            </div>
          </a>
        );
      })}
    </AppShell>
  );
}
