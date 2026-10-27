"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ResultadoLista } from "@/lib/testimonios/lista-aplicar";
import type { CambioLista, PlanLista } from "@/lib/testimonios/lista";
import AppShell from "./AppShell";
import s from "./ImportPanel.module.css";

const CAMPO: Record<CambioLista["campo"], string> = { nombres: "Nombres", apellidos: "Apellidos", celular: "Celular", correo: "Correo", ciudad: "Ciudad", ciudadOriginal: "Ciudad escrita" };
const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

function Cambios({ cambios }: { cambios: CambioLista[] }) {
  return <>{cambios.map((c) => (
    <div key={c.campo} className={s.change}><span className={s.field}>{CAMPO[c.campo]}</span>{" "}<span className={s.struck}>{c.antes || "(vacío)"}</span> → <b>{c.despues || "(vacío)"}</b></div>
  ))}</>;
}

export default function TestimoniosListaPanel({ user }: { user: SessionUser }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [plan, setPlan] = useState<PlanLista | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [eliminar, setEliminar] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoLista | null>(null);

  async function enviar(modo: "vista" | "aplicar", f = archivo) {
    const fd = new FormData();
    fd.append("archivo", f!);
    fd.append("modo", modo);
    if (modo === "aplicar") fd.append("eliminar", JSON.stringify([...eliminar]));
    const res = await fetch("/api/admin/testimonios/lista", { method: "POST", body: fd });
    if (res.status === 401) { window.location.assign("/login"); throw new Error(""); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.mensaje ?? "No pudimos procesar el archivo. Intenta otra vez.");
    return data;
  }

  async function elegir(f: File | null) {
    if (!f) return;
    setArchivo(f); setPlan(null); setResultado(null); setEliminar(new Set()); setError(""); setCargando(true);
    try { setPlan((await enviar("vista", f)).plan); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "Sin conexión. Intenta otra vez."); }
    setCargando(false);
  }

  async function aplicar() {
    setAplicando(true); setError("");
    try { setResultado((await enviar("aplicar")).resultado); setConfirmar(false); setPlan(null); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "Sin conexión. Intenta otra vez."); setConfirmar(false); }
    setAplicando(false);
  }

  function reiniciar() { setArchivo(null); setPlan(null); setResultado(null); setEliminar(new Set()); setError(""); }
  function toggle(id: string) {
    setEliminar((prev) => { const m = new Set(prev); if (m.has(id)) m.delete(id); else m.add(id); return m; });
  }

  const nada = plan && plan.nuevos.length + plan.cambiados.length + eliminar.size === 0;
  const stats: [string, string, number, string][] = plan ? [
    ["nuevos", "Nuevos", plan.nuevos.length, "var(--green)"],
    ["cambiados", "Con datos cambiados", plan.cambiados.length, "var(--yellow)"],
    ["ausentes", "Ya no están", plan.ausentes.length, "var(--red)"],
    ["errores", "Errores", plan.errores.length, "var(--red-ink)"],
    ["avisos", "Avisos", plan.avisos.length, "var(--orange)"],
    ["sin-cambios", "Sin cambios", plan.sinCambios, "var(--line)"],
  ] : [];

  return (
    <AppShell user={user} active="testimonios_lista">
      <div className={s.kicker}>Testimonios · administración</div>
      <h1 className={s.title}>Lista de participantes</h1>
      <p className={s.sub}>
        Lista independiente de la de validación de datos. Primero verás qué cambia; <b>nada se guarda hasta que confirmes</b>. Al aplicar, las respuestas del formulario se vuelven a cruzar con la lista nueva.
      </p>

      {resultado && (
        <div className={s.result} role="status">
          <div className={s.resultTitle}>Lista actualizada ✓</div>
          <ul className={s.resultList}>
            <li>{n(resultado.insertados, "participante nuevo", "participantes nuevos")}</li>
            <li>{n(resultado.actualizados, "participante actualizado", "participantes actualizados")}</li>
            <li>{n(resultado.eliminados, "eliminado", "eliminados")}</li>
            <li>{n(resultado.recruzadas, "respuesta cambió de dueño al volver a cruzar", "respuestas cambiaron de dueño al volver a cruzar")}</li>
          </ul>
          <div className={s.resultActions}>
            <button type="button" className={s.ghostBtn} onClick={reiniciar}>Subir otro archivo</button>
          </div>
        </div>
      )}

      {!resultado && !plan && (
        <label
          className={`${s.drop} ${arrastrando ? s.dropOn : ""}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files[0] ?? null); }}
        >
          <input type="file" accept=".xlsx,.csv" onChange={(e) => elegir(e.target.files?.[0] ?? null)} disabled={cargando} />
          <span className={s.dropIcon} aria-hidden>
            {cargando ? <span className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} /> : (
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
            )}
          </span>
          <span className={s.dropTitle}>{cargando ? "Leyendo el archivo…" : archivo ? archivo.name : "Elige o arrastra el Excel (.xlsx o .csv)"}</span>
          <span className={s.dropHint}>Primera hoja, primera fila con los encabezados. Columnas:</span>
          <span className={s.cols}>{["Nombres", "Apellidos", "Celular", "Correo", "Documento", "Ciudad"].map((c) => <span key={c} className={s.col}>{c}</span>)}</span>
        </label>
      )}

      {error && <div className={s.errBox} role="alert">{error}</div>}

      {plan && !resultado && (
        <>
          <div className={s.fileBar}>
            <span className={s.fileName}>{archivo?.name} · {plan.filasLeidas} filas</span>
            <button type="button" className={s.linkBtn} onClick={reiniciar}>Cambiar archivo</button>
          </div>

          <div className={s.stats}>
            {stats.map(([id, label, k, dot]) => (
              <a key={id} href={`#${id}`} className={s.stat}>
                <span className={s.statLabel}><i className={s.dot} style={{ background: dot }} />{label}</span>
                <span className={s.statNum}>{k}</span>
              </a>
            ))}
          </div>

          {plan.nuevos.length > 0 && (
            <details id="nuevos" className={s.section} open={plan.nuevos.length <= 30}>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--green)" }} />Nuevos ({plan.nuevos.length})</span></summary>
              {plan.nuevos.map((f) => (
                <div key={f.documento} className={s.item}>
                  <div className={s.itemTop}><span className={s.itemName}>{f.nombre}</span><span className={s.itemMeta}>{f.documento} · {f.ciudad}{f.ciudadOriginal ? ` (${f.ciudadOriginal})` : ""}</span></div>
                  <div className={s.itemSub}>{[f.correo || "(sin correo)", f.celular || "(sin celular)"].join(" · ")}</div>
                </div>
              ))}
            </details>
          )}

          {plan.cambiados.length > 0 && (
            <details id="cambiados" className={s.section} open>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--yellow)" }} />Con datos cambiados ({plan.cambiados.length})</span></summary>
              {plan.cambiados.map((c) => (
                <div key={c.id} className={s.item}>
                  <div className={s.itemTop}><span className={s.itemName}>{c.nombre}</span><span className={s.itemMeta}>{c.documento} · fila {c.fila}</span></div>
                  <Cambios cambios={c.cambios} />
                </div>
              ))}
            </details>
          )}

          {plan.ausentes.length > 0 && (
            <details id="ausentes" className={s.section} open>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--red)" }} />Ya no están en la lista ({plan.ausentes.length})</span></summary>
              <p className={s.secNote}>Por defecto <b>se dejan</b>. Si eliminas a alguien, sus comentarios se conservan y sus respuestas se vuelven a cruzar (si nadie más coincide, pasan a "Sin dueño").</p>
              <div className={s.pickTools}>
                <button type="button" className={s.linkBtn} onClick={() => setEliminar(new Set(plan.ausentes.map((a) => a.id)))}>Marcar todos</button>
                <button type="button" className={s.linkBtn} onClick={() => setEliminar(new Set())}>Ninguno</button>
              </div>
              {plan.ausentes.map((a) => (
                <label key={a.id} className={`${s.pick} ${eliminar.has(a.id) ? s.pickOn : ""}`}>
                  <input type="checkbox" checked={eliminar.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Eliminar a ${a.nombre}`} />
                  <span className={s.pickBody}>
                    <span className={s.itemTop}><span className={s.itemName}>{a.nombre}</span></span>
                    <span className={s.itemMeta}>{a.documento} · {a.ciudad}</span>
                  </span>
                </label>
              ))}
            </details>
          )}

          {plan.errores.length > 0 && (
            <details id="errores" className={s.section} open>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--red-ink)" }} />Errores ({plan.errores.length})</span></summary>
              <p className={s.secNote}>Estas filas <b>no se importan</b>. Corrígelas en el Excel y vuelve a subirlo.</p>
              {plan.errores.map((e) => (
                <div key={`${e.fila}-${e.mensaje}`} className={s.item}>
                  <div className={s.itemTop}><span className={s.itemName}>Fila {e.fila}{e.documento ? ` · ${e.documento}` : ""}</span></div>
                  <div className={s.itemSub}>{e.mensaje}</div>
                </div>
              ))}
            </details>
          )}

          {plan.avisos.length > 0 && (
            <details id="avisos" className={s.section}>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--orange)" }} />Avisos ({plan.avisos.length})</span></summary>
              <p className={s.secNote}>Se importan igual.</p>
              {plan.avisos.map((a) => <div key={`${a.fila}-${a.mensaje}`} className={s.item}><div className={s.itemSub}>Fila {a.fila} · {a.documento}: {a.mensaje}</div></div>)}
            </details>
          )}

          <div className={s.bar}>
            <div className={s.barText}>
              {nada ? "No hay nada que aplicar." : <>Se crearán <b>{plan.nuevos.length}</b> · se actualizarán <b>{plan.cambiados.length}</b> · se eliminarán <b>{eliminar.size}</b></>}
            </div>
            <button type="button" className="btn btn-primary" disabled={!!nada} onClick={() => setConfirmar(true)}>Aplicar cambios</button>
          </div>
        </>
      )}

      {confirmar && plan && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && !aplicando && setConfirmar(false)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="tl-conf">
            <div id="tl-conf" className={s.modalTitle}>¿Aplicar la nueva lista?</div>
            <ul className={s.modalList}>
              <li>{n(plan.nuevos.length, "participante nuevo", "participantes nuevos")}</li>
              <li>{n(plan.cambiados.length, "participante actualizado", "participantes actualizados")}</li>
              <li>{n(eliminar.size, "eliminado", "eliminados")}</li>
              <li>Después se vuelven a cruzar las respuestas del formulario.</li>
            </ul>
            {eliminar.size > 0 && <div className={s.warn}>Eliminar no se puede deshacer.</div>}
            <div className={s.modalActions}>
              <button type="button" className={s.cancel} onClick={() => setConfirmar(false)} disabled={aplicando}>Cancelar</button>
              <button type="button" className={s.apply} onClick={aplicar} disabled={aplicando}>{aplicando ? "Aplicando…" : "Sí, aplicar"}</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
