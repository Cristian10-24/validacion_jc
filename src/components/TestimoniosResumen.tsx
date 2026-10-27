"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ResumenTestimonios } from "@/lib/testimonios/resumen";
import AppShell from "./AppShell";
import { descargarPendientesTestimonios } from "./TestimoniosPanel";
import s from "./AdminOverview.module.css";

type Descarga = { estado: "idle" } | { estado: "loading" } | { estado: "done"; archivo: string; filas: number } | { estado: "error" };

const REFRESCO_MS = 30_000;
const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
// Mismo semáforo que el Resumen de validación: ≥ 85 % verde, 65–84 % amarillo, < 65 % rojo.
const colorAvance = (p: number) => (p >= 85 ? "var(--green)" : p >= 65 ? "var(--yellow)" : "var(--red)");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function TestimoniosResumen({ user }: { user: SessionUser }) {
  const [data, setData] = useState<ResumenTestimonios | null>(null);
  const [error, setError] = useState(false);
  const [dl, setDl] = useState<Descarga>({ estado: "idle" });

  async function cargar(silencioso = false) {
    try {
      const res = await fetch("/api/testimonios/resumen", { cache: "no-store" });
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
    const onVisible = () => { if (document.visibilityState === "visible") cargar(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  async function exportar() {
    setDl({ estado: "loading" });
    try {
      setDl({ estado: "done", ...(await descargarPendientesTestimonios("")) });
    } catch {
      setDl({ estado: "error" });
    }
  }

  const t = data?.total;
  const pr = data?.porResolver;
  const hora = data ? new Date(data.actualizado).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "";

  return (
    <AppShell user={user} active="testimonios_resumen">
      <div className={s.top}>
        <section className={s.hero} aria-label="Avance total de testimonios">
          <i className={s.heroRing} aria-hidden />
          <i className={s.heroSun} aria-hidden />
          <div className={s.heroKicker}>Testimonios · avance total</div>
          <div className={s.heroNum}>
            <span className={s.heroPct}>{t ? `${Math.round(pct(t.realizado, t.total))}%` : "–"}</span>
            <span className={s.heroOf}>{t ? `${t.realizado} de ${t.total} enviaron su video` : "Cargando…"}</span>
          </div>
          <div className={s.heroBar} aria-hidden>
            <i style={{ width: `${t ? pct(t.realizado, t.total) : 0}%`, background: "#3DD598" }} />
            <i style={{ width: `${t ? pct(t.seguimiento, t.total) : 0}%`, background: "var(--yellow)" }} />
          </div>
          {t && (
            <div className={s.legend}>
              <span><i className={s.dot} style={{ background: "#3DD598" }} />{plural(t.realizado, "realizado", "realizados")}</span>
              <span><i className={s.dot} style={{ background: "var(--yellow)" }} />{t.seguimiento} en seguimiento</span>
              <span><i className={s.dot} style={{ background: "#FF7A85" }} />{plural(t.pendiente, "pendiente", "pendientes")}</span>
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: 14 }}>
          {pr && (
            <section className={s.final}>
              <div className={s.finalTitle}>Respuestas por resolver</div>
              <div className={s.finalText}>
                <b>{plural(pr.sinDuenio, "respuesta", "respuestas")} sin dueño</b> y <b>{plural(pr.conflicto, "en conflicto", "en conflicto")}</b>: videos que llegaron pero no se pudieron asignar a un participante.
              </div>
              <a className="btn btn-primary" href="/admin/testimonios/sin-duenio" style={{ textDecoration: "none" }}>Ir a Sin dueño</a>
            </section>
          )}
          <section className={s.final}>
            <div className={s.finalTitle}>Pendientes por contactar</div>
            <div className={s.finalText}>
              Excel de quienes aún no envían su video: <b>{t ? t.pendiente + t.seguimiento : "–"}</b> ({t?.pendiente ?? "–"} pendientes y {t?.seguimiento ?? "–"} en seguimiento), con celular con indicativo y su último comentario.
            </div>
            {(dl.estado === "idle" || dl.estado === "error") && (
              <>
                {dl.estado === "error" && <div className={s.errBox}>No pudimos generar el archivo. Revisa tu conexión e intenta otra vez.</div>}
                <button type="button" className="btn btn-primary" onClick={exportar} disabled={!t || t.pendiente + t.seguimiento === 0}>{dl.estado === "error" ? "Intentar de nuevo" : "Exportar pendientes"}</button>
              </>
            )}
            {dl.estado === "loading" && <button type="button" className="btn btn-primary" disabled><span className="spinner-sm" />Generando Excel…</button>}
            {dl.estado === "done" && (
              <div className={s.done}>
                <div>
                  <div className={s.doneTitle}>Descargado ✓ · {dl.filas} {dl.filas === 1 ? "persona" : "personas"}</div>
                  <div className={s.doneFile}>{dl.archivo}</div>
                </div>
                <button type="button" className={s.doneBtn} onClick={() => setDl({ estado: "idle" })}>Otra vez</button>
              </div>
            )}
          </section>
        </div>
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

      <div className={s.tHead}><span>Ciudad</span><span>Avance</span><span>%</span><span>Realizados</span><span>Seguimiento</span><span>Pendientes</span><span>Monitores</span></div>
      {error && !data && <div className={s.errBox} style={{ marginTop: 12 }}>No pudimos cargar el resumen. <button type="button" className="btn-link" onClick={() => cargar()}>Intentar de nuevo</button></div>}
      {!data && !error && <div className={s.skeleton}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}
      {data && data.ciudades.length === 0 && <div className={s.updated} style={{ marginTop: 12 }}>Todavía no hay participantes. Sube la lista en "Lista testimonios".</div>}
      {data?.ciudades.map((c) => {
        const p = pct(c.realizado, c.total);
        return (
          <a key={c.ciudad} className={s.city} href={`/testimonios?ciudad=${encodeURIComponent(c.ciudad)}`} title={`Ver testimonios de ${c.ciudad}`}>
            <div className={s.cName}>{c.ciudad}</div>
            <div className={s.cBar} aria-hidden>
              <i style={{ width: `${p}%`, background: colorAvance(p) }} />
              <i style={{ width: `${pct(c.seguimiento, c.total)}%`, background: "var(--yellow-soft)" }} />
            </div>
            <div className={s.cPct}>{Math.round(p)}%</div>
            <div className={s.cNums}>
              <span><b>{c.realizado}</b> / {c.total}<span className={s.numLabel}>{c.realizado === 1 ? " realizado" : " realizados"}</span></span>
              <span><b>{c.seguimiento}</b><span className={s.numLabel}> en seguimiento</span></span>
              <span><b>{c.pendiente}</b><span className={s.numLabel}>{c.pendiente === 1 ? " pendiente" : " pendientes"}</span></span>
            </div>
            <div className={s.cMon}>{c.monitores.join(", ") || "Sin monitor asignado"}</div>
          </a>
        );
      })}
    </AppShell>
  );
}
