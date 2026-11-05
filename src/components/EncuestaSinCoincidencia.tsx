"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { FilaSinCoincidencia } from "@/lib/encuesta/vista";
import AppShell from "./AppShell";
import m from "./MonitorPanel.module.css";
import t from "./TestimoniosPanel.module.css";
import s from "./TestimoniosSinDuenio.module.css";

// Respuestas de la encuesta que no coinciden con ningún participante (solo lectura, para revisar a mano).
// El cruce se recalcula en cada carga: si se corrige la lista de participantes, la respuesta sale de aquí sola.

const STY: Record<FilaSinCoincidencia["motivo"], { label: string; bg: string; fg: string; dot: string; ayuda: string }> = {
  sin_coincidencia: { label: "Sin coincidencia", bg: "var(--red-soft)", fg: "var(--red-dark)", dot: "var(--red)", ayuda: "Ni el documento ni el correo coinciden con ningún participante de la lista." },
  conflicto: { label: "Correo de varias personas", bg: "var(--yellow-soft, #FFF4D6)", fg: "var(--yellow-text)", dot: "var(--yellow)", ayuda: "El documento no coincide con nadie y el correo es de varios participantes: no se puede saber de quién es." },
};

function fecha(iso: string): string {
  const d = new Date(iso), tz = "America/Bogota";
  return `${d.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: tz }).replace(".", "")} · ${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;
}

export default function EncuestaSinCoincidencia({ user }: { user: SessionUser }) {
  const [filas, setFilas] = useState<FilaSinCoincidencia[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  async function cargar() {
    setLoadErr(false);
    try {
      const res = await fetch("/api/admin/encuesta/sin-coincidencia", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setFilas((await res.json()).filas);
    } catch {
      setLoadErr(true);
    }
  }
  useEffect(() => { cargar(); }, []);

  return (
    <AppShell user={user} active="encuesta_sin_coincidencia">
      <div className={m.head}>
        <div>
          <div className={m.kicker}>Encuesta final · Sin coincidencia</div>
          <div className={m.total}>{filas ? (filas.length ? `${filas.length} por revisar` : "Todo coincide") : "Cargando…"}</div>
        </div>
      </div>
      <p className={s.intro}>
        Respuestas de la encuesta que no se pudieron relacionar con ningún participante, ni por documento ni por correo.
        Revísalas a mano: puede ser un documento mal escrito o alguien que no está en la lista. Si corriges la lista de
        participantes (en "Lista testimonios"), la respuesta sale de aquí sola.
      </p>

      <div className={s.lista}>
        {loadErr && (
          <div className={m.empty}>
            <div className={m.emptyTitle}>No pudimos cargar las respuestas</div>
            <button type="button" className={`${t.act} ${t.actGhost}`} onClick={cargar}>Intentar de nuevo</button>
          </div>
        )}
        {!filas && !loadErr && <div className={m.skeleton}>{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div>}
        {filas && filas.length === 0 && (
          <div className={m.empty}>
            <div className={m.emptyIcon} style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>✓</div>
            <div className={m.emptyTitle}>Todas las respuestas coinciden</div>
            <div className={m.emptyText}>Cada respuesta de la encuesta corresponde a un participante.</div>
          </div>
        )}

        {filas?.map((r) => {
          const st = STY[r.motivo];
          return (
            <article key={r.id} className={s.card}>
              <div className={s.cardTop}>
                <span className={t.badge} style={{ background: st.bg, color: st.fg }}><i className={t.dot} style={{ background: st.dot, width: 8, height: 8 }} />{st.label}</span>
                <span className={s.cuando}>Respondió {fecha(r.fecha)}{r.fila ? ` · fila ${r.fila} del Sheet` : ""}</span>
              </div>
              <div className={s.ayuda}>{st.ayuda}</div>
              <div className={s.cuerpo}>
                <div>
                  <div className={s.secLabel}>Lo que escribió en el formulario</div>
                  <dl className={t.info}>
                    <dt>Nombre</dt><dd>{r.nombre || "—"}</dd>
                    <dt>Documento</dt><dd>{r.documento || "—"}</dd>
                    <dt>Correo</dt><dd>{r.correo || "—"}</dd>
                    <dt>Ciudad</dt><dd>{r.ciudad || "—"}</dd>
                  </dl>
                </div>
                {r.candidatos.length > 0 && (
                  <div>
                    <div className={s.secLabel}>Participantes con ese correo</div>
                    <ul className={s.candidatos}>
                      {r.candidatos.map((c) => (
                        <li key={c.documento} className={s.candidato}>
                          <div className={s.cText}>
                            <div className={s.cNombre}>{c.nombre}</div>
                            <div className={s.cDatos}>{c.documento} · {c.ciudad}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
