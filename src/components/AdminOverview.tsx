"use client";

import { useEffect, useState } from "react";
import type { CiudadResumen } from "@/app/api/admin/resumen/route";
import type { SessionUser } from "@/lib/auth";
import AppShell from "./AppShell";
import s from "./AdminOverview.module.css";

type Resumen = { total: { total: number; validado: number; corregido: number; pendiente: number }; ciudades: CiudadResumen[]; actualizado: string };
type Descarga = { estado: "idle" } | { estado: "loading" } | { estado: "done"; archivo: string; filas: number } | { estado: "error" };

const REFRESCO_MS = 30_000;
const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
// Semáforo por ciudad (prototipo): ≥ 85 % verde, 65–84 % amarillo, < 65 % rojo.
const colorAvance = (p: number) => (p >= 85 ? "var(--green)" : p >= 65 ? "var(--yellow)" : "var(--red)");

export default function AdminOverview({ user }: { user: SessionUser }) {
  const [data, setData] = useState<Resumen | null>(null);
  const [error, setError] = useState(false);
  const [dl, setDl] = useState<Descarga>({ estado: "idle" });

  async function cargar(silencioso = false) {
    try {
      const res = await fetch("/api/admin/resumen", { cache: "no-store" });
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

  async function descargar() {
    setDl({ estado: "loading" });
    try {
      const res = await fetch("/api/admin/exportar", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const archivo = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "certificados_jovenes_creativos.xlsx";
      const filas = Number(res.headers.get("X-Filas") ?? 0);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement("a"), { href: url, download: archivo });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDl({ estado: "done", archivo, filas });
    } catch {
      setDl({ estado: "error" });
    }
  }

  const t = data?.total;
  const ciudades = [...(data?.ciudades ?? [])].sort((a, b) => pct(a.validado, a.total) - pct(b.validado, b.total) || a.ciudad.localeCompare(b.ciudad, "es"));
  const hora = data ? new Date(data.actualizado).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "";

  return (
    <AppShell user={user} active="resumen">
      <div className={s.top}>
        <section className={s.hero} aria-label="Avance total">
          <i className={s.heroRing} aria-hidden />
          <i className={s.heroSun} aria-hidden />
          <div className={s.heroKicker}>Avance total</div>
          <div className={s.heroNum}>
            <span className={s.heroPct}>{t ? `${Math.round(pct(t.validado, t.total))}%` : "–"}</span>
            <span className={s.heroOf}>{t ? `${t.validado} de ${t.total} validados` : "Cargando…"}</span>
          </div>
          <div className={s.heroBar} aria-hidden>
            <i style={{ width: `${t ? pct(t.validado, t.total) : 0}%`, background: "#3DD598" }} />
            <i style={{ width: `${t ? pct(t.corregido, t.total) : 0}%`, background: "var(--yellow)" }} />
          </div>
          {t && (
            <div className={s.legend}>
              <span><i className={s.dot} style={{ background: "#3DD598" }} />{t.validado} {t.validado === 1 ? "validado" : "validados"}</span>
              <span><i className={s.dot} style={{ background: "var(--yellow)" }} />{t.corregido} {t.corregido === 1 ? "corregido" : "corregidos"}</span>
              <span><i className={s.dot} style={{ background: "#FF7A85" }} />{t.pendiente} {t.pendiente === 1 ? "pendiente" : "pendientes"}</span>
            </div>
          )}
        </section>

        <section className={s.final}>
          <div className={s.finalTitle}>Lista final para certificados</div>
          <div className={s.finalText}>
            Excel con nombre completo, correo y ciudad de los <b>{t?.validado ?? "–"} validados</b>.
            {t && t.corregido > 0 && <> Los {t.corregido} corregidos entran cuando su monitor los apruebe.</>}
          </div>
          <div style={{ flex: 1 }} />
          {(dl.estado === "idle" || dl.estado === "error") && (
            <>
              {dl.estado === "error" && <div className={s.errBox}>No pudimos generar el archivo. Revisa tu conexión e intenta otra vez.</div>}
              <button type="button" className="btn btn-primary" onClick={descargar} disabled={!t}>{dl.estado === "error" ? "Intentar de nuevo" : "Descargar lista final"}</button>
            </>
          )}
          {dl.estado === "loading" && <button type="button" className="btn btn-primary" disabled><span className="spinner-sm" />Generando Excel…</button>}
          {dl.estado === "done" && (
            <div className={s.done}>
              <div>
                <div className={s.doneTitle}>Descargado ✓ · {dl.filas} estudiantes</div>
                <div className={s.doneFile}>{dl.archivo}</div>
              </div>
              <button type="button" className={s.doneBtn} onClick={() => setDl({ estado: "idle" })}>Otra vez</button>
            </div>
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

      <div className={s.tHead}><span>Ciudad</span><span>Avance</span><span>%</span><span>Validados</span><span>Corregidos</span><span>Pendientes</span><span>Monitores</span></div>
      {error && !data && <div className={s.errBox} style={{ marginTop: 12 }}>No pudimos cargar el resumen. <button type="button" className="btn-link" onClick={() => cargar()}>Intentar de nuevo</button></div>}
      {!data && !error && <div className={s.skeleton}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}
      {ciudades.map((c) => {
        const p = pct(c.validado, c.total);
        return (
          <a key={c.ciudad} className={s.city} href={`/monitor?ciudad=${encodeURIComponent(c.ciudad)}`} title={`Ver estudiantes de ${c.ciudad}`}>
            <div className={s.cName}>{c.ciudad}</div>
            <div className={s.cBar} aria-hidden>
              <i style={{ width: `${p}%`, background: colorAvance(p) }} />
              <i style={{ width: `${pct(c.corregido, c.total)}%`, background: "var(--yellow-soft)" }} />
            </div>
            <div className={s.cPct}>{Math.round(p)}%</div>
            <div className={s.cNums}>
              <span><b>{c.validado}</b> / {c.total}<span className={s.numLabel}>{c.validado === 1 ? " validado" : " validados"}</span></span>
              <span><b>{c.corregido}</b><span className={s.numLabel}>{c.corregido === 1 ? " corregido" : " corregidos"}</span></span>
              <span><b>{c.pendiente}</b><span className={s.numLabel}>{c.pendiente === 1 ? " pendiente" : " pendientes"}</span></span>
            </div>
            <div className={s.cMon}>{c.monitores.join(", ") || "Sin monitor asignado"}</div>
          </a>
        );
      })}
    </AppShell>
  );
}
