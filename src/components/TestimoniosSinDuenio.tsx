"use client";

import { useEffect, useMemo, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { celularConIndicativo } from "@/lib/testimonios/celular";
import type { CandidatoVista, RespuestaPorResolver } from "@/lib/testimonios/sin-duenio";
import AppShell from "./AppShell";
import m from "./MonitorPanel.module.css";
import t from "./TestimoniosPanel.module.css";
import s from "./TestimoniosSinDuenio.module.css";

type Pestana = "resolver" | "descartadas";
type Modal = { tipo: "asignar" | "descartar"; r: RespuestaPorResolver } | null;

const STY = {
  sin_duenio: { label: "Sin dueño", bg: "var(--red-soft)", fg: "var(--red-dark)", dot: "var(--red)", ayuda: "Ningún participante coincide por documento, correo ni celular." },
  conflicto: { label: "Conflicto", bg: "var(--yellow-soft)", fg: "var(--yellow-text)", dot: "var(--yellow)", ayuda: "Sus datos coinciden con más de un participante. Elige a quién pertenece." },
  descartada: { label: "Descartada", bg: "var(--surface-2)", fg: "var(--muted)", dot: "var(--muted-2)", ayuda: "" },
} as const;

const fold = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palabras = (x: string) => fold(x).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 3);
function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso), tz = "America/Bogota";
  return `${d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "")} · ${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;
}

/** Sugerencias para asignar: participantes que comparten palabras del nombre escrito (misma ciudad primero). */
function sugerencias(r: RespuestaPorResolver, participantes: CandidatoVista[]): CandidatoVista[] {
  const claves = new Set(palabras(r.norm.nombre));
  if (!claves.size) return [];
  return participantes
    .map((p) => ({ p, n: palabras(p.nombre).filter((w) => claves.has(w)).length + (p.ciudad === r.norm.ciudad ? 0.5 : 0) }))
    .filter((x) => x.n >= 1)
    .sort((a, b) => b.n - a.n || a.p.nombre.localeCompare(b.p.nombre, "es"))
    .slice(0, 5)
    .map((x) => x.p);
}

export default function TestimoniosSinDuenio({ user }: { user: SessionUser }) {
  const [data, setData] = useState<{ respuestas: RespuestaPorResolver[]; participantes: CandidatoVista[] } | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [pestana, setPestana] = useState<Pestana>("resolver");
  const [modal, setModal] = useState<Modal>(null);
  const [q, setQ] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  async function cargar() {
    setLoadErr(false);
    try {
      const res = await fetch("/api/admin/testimonios/sin-duenio", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setLoadErr(true);
    }
  }
  useEffect(() => { cargar(); }, []);

  const porResolver = useMemo(() => (data?.respuestas ?? []).filter((r) => r.cruce !== "descartada"), [data]);
  const descartadas = useMemo(() => (data?.respuestas ?? []).filter((r) => r.cruce === "descartada"), [data]);
  const visibles = pestana === "resolver" ? porResolver : descartadas;

  const resultados = useMemo(() => {
    if (!data || !modal || modal.tipo !== "asignar") return [];
    const k = fold(q.trim()), kd = q.replace(/\D/g, "");
    if (!k) return [];
    return data.participantes.filter((p) => fold(`${p.nombre} ${p.documento} ${p.correo}`).includes(k) || (kd.length >= 4 && p.celular.includes(kd))).slice(0, 8);
  }, [data, modal, q]);

  function abrir(tipo: "asignar" | "descartar", r: RespuestaPorResolver, preElegido: string | null = null) {
    setModal({ tipo, r });
    setQ("");
    setElegido(preElegido);
    setMotivo("");
    setErrorModal("");
  }

  async function confirmar() {
    if (!modal) return;
    setGuardando(true);
    setErrorModal("");
    try {
      const body = modal.tipo === "asignar" ? { accion: "asignar", participanteId: elegido } : { accion: "descartar", motivo: motivo.trim() || undefined };
      const res = await fetch(`/api/admin/testimonios/respuestas/${modal.r.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) return window.location.assign("/login");
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.mensaje ?? "No se pudo guardar. Intenta otra vez.");
      const nombre = data?.participantes.find((p) => p.id === elegido)?.nombre;
      setToast(modal.tipo === "asignar" ? `Asignada a ${nombre} ✓` : "Respuesta descartada ✓");
      setTimeout(() => setToast(null), 2800);
      setModal(null);
      await cargar();
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : "No se pudo guardar.");
    }
    setGuardando(false);
  }

  const elegidoP = data?.participantes.find((p) => p.id === elegido) ?? null;
  const opciones = modal?.tipo === "asignar" ? (q.trim() ? resultados : modal.r.candidatos.length ? modal.r.candidatos : sugerencias(modal.r, data?.participantes ?? [])) : [];
  const tituloOpciones = q.trim() ? "Resultados" : modal?.r.candidatos.length ? "Candidatos (coinciden sus datos)" : "Sugerencias por el nombre escrito";

  return (
    <AppShell user={user} active="testimonios_sin_duenio">
      <div className={m.head}>
        <div>
          <div className={m.kicker}>Testimonios · Sin dueño</div>
          <div className={m.total}>{data ? (porResolver.length ? `${porResolver.length} por resolver` : "Todo resuelto") : "Cargando…"}</div>
        </div>
      </div>
      <p className={s.intro}>Videos que llegaron del formulario pero no se pudieron asignar solos. Asígnalos al participante correcto o descártalos (pruebas, duplicados, personas que no son del programa). Cada decisión queda registrada.</p>

      <div className={`${m.filters} ${s.tabs}`} role="tablist">
        {([["resolver", "Por resolver", porResolver.length, "var(--red)"], ["descartadas", "Descartadas", descartadas.length, "var(--muted-2)"]] as const).map(([k, label, n, dot]) => (
          <button key={k} type="button" role="tab" aria-selected={pestana === k} className={`${m.filter} ${pestana === k ? m.filterOn : ""}`} onClick={() => setPestana(k)}>
            <span className={m.filterLabel}><i className={m.dot} style={{ background: dot }} />{label}</span>
            <span className={m.filterCount}>{data ? n : "–"}</span>
          </button>
        ))}
      </div>

      <div className={s.lista}>
        {loadErr && (
          <div className={m.empty}>
            <div className={m.emptyTitle}>No pudimos cargar las respuestas</div>
            <button type="button" className={`${t.act} ${t.actGhost}`} onClick={cargar}>Intentar de nuevo</button>
          </div>
        )}
        {!data && !loadErr && <div className={m.skeleton}>{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div>}
        {data && visibles.length === 0 && (
          <div className={m.empty}>
            <div className={m.emptyIcon} style={{ background: "var(--green-soft)", color: "var(--green-dark)" }}>✓</div>
            <div className={m.emptyTitle}>{pestana === "resolver" ? "No hay respuestas por resolver" : "No hay respuestas descartadas"}</div>
            <div className={m.emptyText}>{pestana === "resolver" ? "Todas las respuestas del formulario tienen dueño." : "Las que descartes aparecerán aquí."}</div>
          </div>
        )}

        {visibles.map((r) => {
          const st = STY[r.cruce];
          return (
            <article key={r.id} className={s.card}>
              <div className={s.cardTop}>
                <span className={t.badge} style={{ background: st.bg, color: st.fg }}><i className={t.dot} style={{ background: st.dot, width: 8, height: 8 }} />{st.label}</span>
                <span className={s.cuando}>Enviado {fecha(r.fecha)}{r.fila ? ` · fila ${r.fila} del Sheet` : ""}</span>
              </div>
              {st.ayuda && <div className={s.ayuda}>{st.ayuda}</div>}

              <div className={s.cuerpo}>
                <div>
                  <div className={s.secLabel}>Lo que escribió en el formulario</div>
                  <dl className={t.info}>
                    <dt>Nombre</dt><dd>{r.norm.nombre || "—"}</dd>
                    <dt>Documento</dt><dd>{r.norm.documento || "—"}</dd>
                    <dt>Correo</dt><dd>{r.norm.correo || "—"}</dd>
                    <dt>Celular</dt><dd>{r.norm.celular ? celularConIndicativo(r.norm.celular, r.norm.ciudad) : "—"}</dd>
                    <dt>Ciudad</dt><dd>{r.norm.ciudad || "—"}{r.norm.ciudadOriginal ? ` (escrita como "${r.norm.ciudadOriginal}")` : ""}</dd>
                  </dl>
                  <div className={t.links}>{r.enlaces.map((u, j) => <a key={u} className={t.link} href={u} target="_blank" rel="noopener noreferrer">{r.enlaces.length > 1 ? `Video ${j + 1}` : "Ver video"} ↗</a>)}</div>
                </div>

                {r.candidatos.length > 0 && (
                  <div>
                    <div className={s.secLabel}>Candidatos</div>
                    <ul className={s.candidatos}>
                      {r.candidatos.map((c) => (
                        <li key={c.id} className={s.candidato}>
                          <div className={s.cText}>
                            <div className={s.cNombre}>{c.nombre}</div>
                            <div className={s.cDatos}>{c.documento} · {c.ciudad}</div>
                            <div className={s.cDatos}>{c.correo || "(sin correo)"}{c.celular ? ` · ${celularConIndicativo(c.celular, c.ciudad)}` : ""}</div>
                          </div>
                          <button type="button" className={`${t.act} ${t.actGhost}`} onClick={() => abrir("asignar", r, c.id)}>Asignar</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {r.asignacion && r.cruce === "descartada" && (
                <div className={s.decision}>Descartada por {r.asignacion.por} · {fecha(r.asignacion.en)}{r.asignacion.motivo ? ` · "${r.asignacion.motivo}"` : ""}</div>
              )}

              <div className={s.acciones}>
                {r.cruce !== "descartada" && <button type="button" className={`${t.act} ${t.actGhost}`} onClick={() => abrir("descartar", r)}>Descartar</button>}
                <button type="button" className={`${t.act} ${s.asignar}`} onClick={() => abrir("asignar", r)}>{r.candidatos.length ? "Buscar a otra persona" : "Asignar a un participante"}</button>
              </div>
            </article>
          );
        })}
      </div>

      {modal && (
        <div className={m.overlay} onClick={(e) => e.target === e.currentTarget && !guardando && setModal(null)}>
          <div className={m.modal} role="dialog" aria-modal="true" aria-labelledby="sd-t">
            {modal.tipo === "asignar" ? (
              <>
                <div id="sd-t" className={m.modalTitle}>Asignar respuesta</div>
                <div className={s.resumen}>Envío de <b>{modal.r.norm.nombre || "(sin nombre)"}</b>{modal.r.norm.documento ? ` · doc. ${modal.r.norm.documento}` : ""}{modal.r.norm.correo ? ` · ${modal.r.norm.correo}` : ""}</div>
                <label className={m.search} style={{ marginTop: 14 }}>
                  <span className={m.searchIcon} aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar participante por nombre, documento, correo o celular" aria-label="Buscar participante" autoFocus />
                </label>
                <div className={s.secLabel} style={{ marginTop: 12 }}>{tituloOpciones}</div>
                {opciones.length === 0 ? <div className={t.vacio}>{q.trim() ? "No encontramos a nadie con esa búsqueda." : "Escribe para buscar en la lista de participantes."}</div> : (
                  <ul className={s.opciones}>
                    {opciones.map((p) => (
                      <li key={p.id}>
                        <button type="button" className={`${s.opcion} ${elegido === p.id ? s.opcionOn : ""}`} onClick={() => setElegido(p.id)} aria-pressed={elegido === p.id}>
                          <span className={s.cNombre}>{p.nombre}</span>
                          <span className={s.cDatos}>{p.documento} · {p.ciudad}{p.correo ? ` · ${p.correo}` : ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {elegidoP && <div className={s.confirma}>Se asignará a <b>{elegidoP.nombre}</b> ({elegidoP.ciudad}) y quedará como <b>Realizado</b>, marcado como asignado a mano.</div>}
              </>
            ) : (
              <>
                <div id="sd-t" className={m.modalTitle}>Descartar respuesta</div>
                <div className={s.resumen}>Envío de <b>{modal.r.norm.nombre || "(sin nombre)"}</b> · {fecha(modal.r.fecha)}. No contará para ningún participante. Podrás asignarla después desde "Descartadas".</div>
                <label className={s.motivoLabel} htmlFor="sd-motivo">Motivo (opcional)</label>
                <textarea id="sd-motivo" className={t.textarea} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: Envío de prueba / Ya tiene otro envío / No es del programa" />
              </>
            )}
            {errorModal && <div className="msg-error" style={{ marginTop: 10 }}>{errorModal}</div>}
            <div className={m.modalActions}>
              <button type="button" className={m.cancel} onClick={() => setModal(null)} disabled={guardando}>Cancelar</button>
              <button type="button" className={m.save} onClick={confirmar} disabled={guardando || (modal.tipo === "asignar" && !elegido)}>
                {guardando ? "Guardando…" : modal.tipo === "asignar" ? "Asignar" : "Descartar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`${m.toast} ${m.toastOk}`} role="status">{toast}</div>}
    </AppShell>
  );
}
