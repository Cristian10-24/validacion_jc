"use client";

import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { Cambio, PlanImport, ResultadoImport } from "@/lib/importer";
import type { Estado } from "@/lib/types";
import AppShell from "./AppShell";
import s from "./ImportPanel.module.css";

const CAMPO: Record<Cambio["campo"], string> = { nombre: "Nombre", correo: "Correo", ciudad: "Ciudad", grupo: "Grupo", monitorRef: "Monitor" };
const ESTADO: Record<Estado, { label: string; bg: string; fg: string; dot: string }> = {
  validado: { label: "Validado", bg: "var(--green-soft)", fg: "var(--green-dark)", dot: "var(--green)" },
  corregido: { label: "Corregido", bg: "var(--yellow-soft)", fg: "var(--yellow-text)", dot: "var(--yellow)" },
  pendiente: { label: "Pendiente", bg: "var(--red-soft)", fg: "var(--red-dark)", dot: "var(--red)" },
};

/** "1 estudiante nuevo" / "3 estudiantes nuevos" */
const n = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

function Badge({ estado }: { estado: Estado }) {
  const e = ESTADO[estado];
  return <span className={s.badge} style={{ background: e.bg, color: e.fg }}><i className={s.dot} style={{ background: e.dot, width: 7, height: 7 }} />{e.label}</span>;
}

function Cambios({ cambios }: { cambios: Cambio[] }) {
  return <>{cambios.map((c) => (
    <div key={c.campo} className={s.change}><span className={s.field}>{CAMPO[c.campo]}</span><span className={s.struck}>{c.antes || "(vacío)"}</span> → <b>{c.despues || "(vacío)"}</b></div>
  ))}</>;
}

export default function ImportPanel({ user }: { user: SessionUser }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [plan, setPlan] = useState<PlanImport | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [eliminar, setEliminar] = useState<Set<string>>(new Set());
  const [confirmar, setConfirmar] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);

  async function enviar(modo: "vista" | "aplicar", f = archivo) {
    const fd = new FormData();
    fd.append("archivo", f!);
    fd.append("modo", modo);
    if (modo === "aplicar") fd.append("eliminar", JSON.stringify([...eliminar]));
    const res = await fetch("/api/admin/importar", { method: "POST", body: fd });
    if (res.status === 401) { window.location.assign("/login"); throw new Error(""); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.mensaje ?? "No pudimos procesar el archivo. Intenta otra vez.");
    return data;
  }

  async function elegir(f: File | null) {
    if (!f) return;
    setArchivo(f);
    setPlan(null);
    setResultado(null);
    setEliminar(new Set());
    setError("");
    setCargando(true);
    try {
      setPlan((await enviar("vista", f)).plan);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sin conexión. Intenta otra vez.");
    }
    setCargando(false);
  }

  async function aplicar() {
    setAplicando(true);
    setError("");
    try {
      setResultado((await enviar("aplicar")).resultado);
      setConfirmar(false);
      setPlan(null);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Sin conexión. Intenta otra vez.");
      setConfirmar(false);
    }
    setAplicando(false);
  }

  function reiniciar() {
    setArchivo(null);
    setPlan(null);
    setResultado(null);
    setEliminar(new Set());
    setError("");
  }

  function toggle(id: string) {
    setEliminar((prev) => {
      const marcados = new Set(prev);
      if (marcados.has(id)) marcados.delete(id);
      else marcados.add(id);
      return marcados;
    });
  }

  const nada = plan && plan.nuevos.length + plan.cambiados.length + eliminar.size === 0;
  const validadosAEliminar = plan ? plan.ausentes.filter((a) => eliminar.has(a.id) && a.estado !== "pendiente").length : 0;

  const stats: [string, string, number, string][] = plan ? [
    ["nuevos", "Nuevos", plan.nuevos.length, "var(--green)"],
    ["cambiados", "Con datos cambiados", plan.cambiados.length, "var(--yellow)"],
    ["ausentes", "Ya no están", plan.ausentes.length, "var(--red)"],
    ["protegidos", "Protegidos", plan.protegidos.length, "var(--muted-2)"],
    ["errores", "Errores", plan.errores.length, "var(--red-ink)"],
    ["sin-cambios", "Sin cambios", plan.sinCambios, "var(--line)"],
  ] : [];

  return (
    <AppShell user={user} active="importar">
      <div className={s.kicker}>Coordinación</div>
      <h1 className={s.title}>Subir lista de estudiantes</h1>
      <p className={s.sub}>
        Sube el Excel actualizado. Primero verás qué cambia; <b>nada se guarda hasta que confirmes</b>. Los estudiantes que ya validaron o enviaron una corrección nunca se modifican.
      </p>

      {resultado && (
        <div className={s.result} role="status">
          <div className={s.resultTitle}>Lista actualizada ✓</div>
          <ul className={s.resultList}>
            <li>{n(resultado.insertados, "estudiante nuevo", "estudiantes nuevos")}</li>
            <li>{n(resultado.actualizados, "pendiente actualizado", "pendientes actualizados")}</li>
            <li>{n(resultado.eliminados, "eliminado", "eliminados")}</li>
            <li>{n(resultado.protegidos, "validado o corregido sin tocar", "validados o corregidos sin tocar")}</li>
          </ul>
          <div className={s.resultActions}>
            <a className={s.primaryLink} href="/admin">Ver resumen</a>
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
          <span className={s.dropHint}>Primera hoja, primera fila con los encabezados. Se aceptan estas columnas:</span>
          <span className={s.cols}>{["Nombres", "Apellidos", "Email", "ID / Documento", "Ciudad", "Grupo (opcional)"].map((c) => <span key={c} className={s.col}>{c}</span>)}</span>
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
            {stats.map(([id, label, n, dot]) => (
              <a key={id} href={`#${id}`} className={s.stat}>
                <span className={s.statLabel}><i className={s.dot} style={{ background: dot }} />{label}</span>
                <span className={s.statNum}>{n}</span>
              </a>
            ))}
          </div>

          {plan.nuevos.length > 0 && (
            <details id="nuevos" className={s.section} open={plan.nuevos.length <= 30}>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--green)" }} />Nuevos ({plan.nuevos.length})</span></summary>
              <p className={s.secNote}>Se crearán como pendientes.</p>
              {plan.nuevos.map((f) => (
                <div key={f.documento} className={s.item}>
                  <div className={s.itemTop}><span className={s.itemName}>{f.nombre}</span><span className={s.itemMeta}>{f.documento} · {f.ciudad}</span></div>
                  <div className={s.itemSub}>{f.correo || "(sin correo)"}</div>
                  {f.avisos.length > 0 && <div className={s.chips}>{f.avisos.map((a) => <span key={a} className={s.chip}>{a}</span>)}</div>}
                </div>
              ))}
            </details>
          )}

          {plan.cambiados.length > 0 && (
            <details id="cambiados" className={s.section} open>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--yellow)" }} />Con datos cambiados ({plan.cambiados.length})</span></summary>
              <p className={s.secNote}>Son pendientes: se actualizan con los datos del archivo.</p>
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
              <p className={s.secNote}>Por defecto <b>se dejan</b>. Marca solo los que quieras eliminar.</p>
              <div className={s.pickTools}>
                <button type="button" className={s.linkBtn} onClick={() => setEliminar(new Set(plan.ausentes.filter((a) => a.estado === "pendiente").map((a) => a.id)))}>Marcar solo pendientes</button>
                <button type="button" className={s.linkBtn} onClick={() => setEliminar(new Set(plan.ausentes.map((a) => a.id)))}>Marcar todos</button>
                <button type="button" className={s.linkBtn} onClick={() => setEliminar(new Set())}>Ninguno</button>
              </div>
              {plan.ausentes.map((a) => (
                <label key={a.id} className={`${s.pick} ${eliminar.has(a.id) ? s.pickOn : ""}`}>
                  <input type="checkbox" checked={eliminar.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Eliminar a ${a.nombre}`} />
                  <span className={s.pickBody}>
                    <span className={s.itemTop}><span className={s.itemName}>{a.nombre}</span><Badge estado={a.estado} /></span>
                    <span className={s.itemMeta}>{a.documento} · {a.ciudad}</span>
                  </span>
                </label>
              ))}
            </details>
          )}

          {plan.protegidos.length > 0 && (
            <details id="protegidos" className={s.section}>
              <summary><span className={s.secTitle}><i className={s.dot} style={{ background: "var(--muted-2)" }} />Protegidos ({plan.protegidos.length})</span></summary>
              <p className={s.secNote}>Ya validaron o enviaron una corrección, así que <b>no se tocan</b> aunque el archivo traiga otros datos. Si hace falta un cambio, corrígelo desde Estudiantes.</p>
              {plan.protegidos.map((c) => (
                <div key={c.id} className={s.item}>
                  <div className={s.itemTop}><span className={s.itemName}>{c.nombre}</span><Badge estado={c.estado} /></div>
                  <span className={s.itemMeta}>{c.documento} · fila {c.fila}</span>
                  <Cambios cambios={c.cambios} />
                </div>
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
              <summary><span className={s.secTitle}>Avisos de correo ({plan.avisos.length})</span></summary>
              <p className={s.secNote}>Se importan igual; el estudiante verá la ayuda para corregirlo.</p>
              {plan.avisos.map((a) => (
                <div key={`${a.fila}-${a.mensaje}`} className={s.item}><div className={s.itemSub}>Fila {a.fila} · {a.documento}: {a.mensaje}</div></div>
              ))}
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
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="conf-title">
            <div id="conf-title" className={s.modalTitle}>¿Aplicar la nueva lista?</div>
            <ul className={s.modalList}>
              <li>{n(plan.nuevos.length, "estudiante nuevo", "estudiantes nuevos")}</li>
              <li>{n(plan.cambiados.length, "pendiente actualizado", "pendientes actualizados")}</li>
              <li>{n(eliminar.size, "eliminado", "eliminados")}</li>
              <li>{n(plan.protegidos.length, "validado o corregido queda como está", "validados o corregidos quedan como están")}</li>
            </ul>
            {eliminar.size > 0 && (
              <div className={s.warn}>
                Eliminar no se puede deshacer.{validadosAEliminar > 0 && <> {validadosAEliminar === 1 ? "Uno de ellos ya validó o envió una corrección." : `${validadosAEliminar} de ellos ya validaron o enviaron una corrección.`}</>}
              </div>
            )}
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
