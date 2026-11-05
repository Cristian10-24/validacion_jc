"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ResumenEncuesta } from "@/lib/encuesta/resumen";
import AppShell from "./AppShell";
import s from "./AdminOverview.module.css";

const REFRESCO_MS = 30_000;
const pct = (n: number, t: number) => (t ? (n / t) * 100 : 0);
// Mismo semáforo que el avance de testimonios: ≥ 85 % verde, 65–84 % amarillo, < 65 % rojo.
const colorAvance = (p: number) => (p >= 85 ? "var(--green)" : p >= 65 ? "var(--yellow)" : "var(--red)");
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function EncuestaResumen({ user }: { user: SessionUser }) {
  const [data, setData] = useState<ResumenEncuesta | null>(null);
  const [error, setError] = useState(false);

  async function cargar(silencioso = false) {
    try {
      const res = await fetch("/api/encuesta/resumen", { cache: "no-store" });
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

  const t = data?.total;
  const sc = data?.sinCoincidencia;
  const hora = data ? new Date(data.actualizado).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "";

  return (
    <AppShell user={user} active="encuesta_resumen">
      <div className={s.top}>
        <section className={s.hero} aria-label="Avance total de la encuesta final">
          <i className={s.heroRing} aria-hidden />
          <i className={s.heroSun} aria-hidden />
          <div className={s.heroKicker}>Encuesta final · avance total</div>
          <div className={s.heroNum}>
            <span className={s.heroPct}>{t ? `${Math.round(pct(t.respondio, t.total))}%` : "–"}</span>
            <span className={s.heroOf}>{t ? `${t.respondio} de ${t.total} respondieron` : "Cargando…"}</span>
          </div>
          <div className={s.heroBar} aria-hidden>
            <i style={{ width: `${t ? pct(t.respondio, t.total) : 0}%`, background: "#3DD598" }} />
          </div>
          {t && (
            <div className={s.legend}>
              <span><i className={s.dot} style={{ background: "#3DD598" }} />{plural(t.respondio, "respondió", "respondieron")}</span>
              <span><i className={s.dot} style={{ background: "#FF7A85" }} />{t.pendiente} {t.pendiente === 1 ? "falta" : "faltan"}{t.conComentarios ? ` (${t.conComentarios} con comentarios)` : ""}</span>
            </div>
          )}
        </section>

        <div style={{ display: "grid", gap: 14 }}>
          {sc !== null && sc !== undefined && (
            <section className={s.final}>
              <div className={s.finalTitle}>Respuestas sin coincidencia</div>
              <div className={s.finalText}>
                <b>{plural(sc, "respuesta", "respuestas")}</b> de la encuesta no {sc === 1 ? "coincide" : "coinciden"} con ningún participante por documento ni por correo. Revísalas a mano.
              </div>
              <a className="btn btn-primary" href="/admin/encuesta/sin-coincidencia" style={{ textDecoration: "none" }}>Ver sin coincidencia</a>
            </section>
          )}
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

      <div className={s.tHead}><span>Ciudad</span><span>Avance</span><span>%</span><span>Respondieron</span><span>Faltan</span><span>Con comentarios</span><span>Monitores</span></div>
      {error && !data && <div className={s.errBox} style={{ marginTop: 12 }}>No pudimos cargar el resumen. <button type="button" className="btn-link" onClick={() => cargar()}>Intentar de nuevo</button></div>}
      {!data && !error && <div className={s.skeleton}>{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</div>}
      {data && data.ciudades.length === 0 && <div className={s.updated} style={{ marginTop: 12 }}>Todavía no hay participantes. Se usa la misma lista de "Lista testimonios".</div>}
      {data?.ciudades.map((c) => {
        const p = pct(c.respondio, c.total);
        return (
          <a key={c.ciudad} className={s.city} href={`/encuesta?ciudad=${encodeURIComponent(c.ciudad)}`} title={`Ver encuesta de ${c.ciudad}`}>
            <div className={s.cName}>{c.ciudad}</div>
            <div className={s.cBar} aria-hidden>
              <i style={{ width: `${p}%`, background: colorAvance(p) }} />
            </div>
            <div className={s.cPct}>{Math.round(p)}%</div>
            <div className={s.cNums}>
              <span><b>{c.respondio}</b> / {c.total}<span className={s.numLabel}> respondieron</span></span>
              <span><b>{c.pendiente}</b><span className={s.numLabel}>{c.pendiente === 1 ? " falta" : " faltan"}</span></span>
              <span title="Informativo: de los que faltan, cuántos ya tienen comentarios"><b style={{ color: "var(--yellow-text)" }}>{c.conComentarios}</b><span className={s.numLabel}> con comentarios</span></span>
            </div>
            <div className={s.cMon}>{c.monitores.join(", ") || "Sin monitor asignado"}</div>
          </a>
        );
      })}
    </AppShell>
  );
}
