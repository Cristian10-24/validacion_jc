"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MonitorRow } from "@/lib/monitor-view";
import type { SessionUser } from "@/lib/auth";
import { puede, ROL_TXT, type RolUsuario } from "@/lib/permisos";
import type { Estado } from "@/lib/types";
import { checkEmail, domainOf, emailError } from "@/lib/validation/email";
import { cleanSpaces, nameWarnings } from "@/lib/validation/name";
import AppShell from "./AppShell";
import s from "./MonitorPanel.module.css";

type Filtro = "all" | Estado;
type Modal = { row: MonitorRow; mode: "editar" | "validar_en_nombre"; nombre: string; correo: string; confirmado: boolean; tried: boolean; saving: boolean; error: string };

// Colores del semáforo (prototipo)
const STY: Record<Estado, { label: string; bg: string; fg: string; dot: string }> = {
  validado: { label: "Validado", bg: "var(--green-soft)", fg: "var(--green-dark)", dot: "var(--green)" },
  corregido: { label: "Corregido", bg: "var(--yellow-soft)", fg: "var(--yellow-text)", dot: "var(--yellow)" },
  pendiente: { label: "Pendiente", bg: "var(--red-soft)", fg: "var(--red-dark)", dot: "var(--red)" },
};
const ORDEN: Record<Estado, number> = { corregido: 0, pendiente: 1, validado: 2 };

const EMPTY: Record<Filtro | "search", [string, string, string, string, string]> = {
  pendiente: ["✓", "¡No hay pendientes!", "Todo tu grupo ya entró a validar.", "var(--green-soft)", "var(--green)"],
  corregido: ["✓", "Nada por revisar", "Aprobaste todas las correcciones.", "var(--green-soft)", "var(--green)"],
  validado: ["∅", "Aún nadie validado", "Comparte el enlace con tu grupo.", "#F5F2EF", "var(--muted-2)"],
  all: ["∅", "Sin estudiantes", "No hay estudiantes asignados a tu ciudad.", "#F5F2EF", "var(--muted-2)"],
  search: ["∅", "No encontramos a nadie", "Prueba con el documento o solo un apellido.", "#F5F2EF", "var(--muted-2)"],
};

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const tz = "America/Bogota";
  const dia = d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "");
  const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "");
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${dia === hoy ? "Hoy" : dia} · ${hora}`;
}

// ----- Historial (coordinación y administración) -----
type HistItem = { campo: "nombre" | "correo" | "estado" | "documento" | "ciudad" | "grupo"; anterior: string; nuevo: string; actor: { rol: string; usuario?: string }; accion: string; fecha: string };
const ACCION_TXT: Record<string, string> = {
  confirmar: "Confirmó sus datos", corregir: "Envió una corrección", aprobar: "Aprobó la corrección",
  editar: "Corrigió los datos", validar_en_nombre: "Validó por el estudiante", importar: "Actualizado desde la lista",
  editar_admin: "Editó el registro",
};
const CAMPO_TXT: Record<HistItem["campo"], string> = { nombre: "Nombre", correo: "Correo", estado: "Estado", documento: "Documento", ciudad: "Ciudad", grupo: "Grupo" };
const actorTxt = (a: HistItem["actor"]) => (a.rol === "estudiante" ? "El estudiante" : `${ROL_TXT[a.rol as RolUsuario] ?? "Monitor"} · ${a.usuario ?? ""}`);

/** Edición completa (solo administración). */
type EdicionAdmin = { row: MonitorRow; documento: string; nombre: string; correo: string; ciudad: string; grupo: string; estado: Estado; saving: boolean; error: string };

/** Junta los cambios de una misma acción (mismo momento y autor) en un solo bloque. */
function agruparHistorial(items: HistItem[]) {
  const grupos: { key: string; accion: string; fecha: string; actor: HistItem["actor"]; cambios: HistItem[] }[] = [];
  for (const it of items) {
    const key = `${it.fecha}|${it.accion}|${it.actor.rol}|${it.actor.usuario ?? ""}`;
    const g = grupos.find((x) => x.key === key);
    if (g) g.cambios.push(it);
    else grupos.push({ key, accion: it.accion, fecha: it.fecha, actor: it.actor, cambios: [it] });
  }
  // Primero nombre y correo, al final el cambio de estado.
  for (const g of grupos) g.cambios.sort((a, b) => Number(a.campo === "estado") - Number(b.campo === "estado"));
  return grupos;
}

export type FiltrosIniciales = { estado: string; ciudad: string; q: string };
const FILTROS_VALIDOS: Filtro[] = ["all", "validado", "corregido", "pendiente"];
const REFRESCO_MS = 30_000;

/** Guarda los filtros en la URL (sin recargar) para que sobrevivan a una recarga o se puedan compartir. */
function filtrosAUrl(filtro: Filtro, ciudad: string, q: string) {
  const p = new URLSearchParams();
  if (filtro !== "all") p.set("estado", filtro);
  if (ciudad) p.set("ciudad", ciudad);
  if (q.trim()) p.set("q", q.trim());
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
}

/** Resalta en "ahora" lo que cambió respecto a "antes". */
function Cambio({ antes, ahora }: { antes: string; ahora: string }) {
  return antes === ahora ? <>{ahora}</> : <span className={s.changed}>{ahora}</span>;
}

export default function MonitorPanel({ user, appUrl, inicial }: { user: SessionUser; appUrl: string; inicial: FiltrosIniciales }) {
  const [rows, setRows] = useState<MonitorRow[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(FILTROS_VALIDOS.includes(inicial.estado as Filtro) ? (inicial.estado as Filtro) : "all");
  const [q, setQ] = useState(inicial.q);
  const [ciudad, setCiudad] = useState(inicial.ciudad);
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<{ text: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [historial, setHistorial] = useState<{ row: MonitorRow; items: HistItem[] | null; error: boolean } | null>(null);
  const [edicion, setEdicion] = useState<EdicionAdmin | null>(null);
  const verTodas = puede(user.rol, "ver_todas_las_ciudades");
  const verHist = puede(user.rol, "ver_historial");
  const editarTodo = puede(user.rol, "editar_todo");
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  /** silencioso = refresco automático: no muestra error si ya hay datos en pantalla. */
  async function cargar(silencioso = false) {
    if (!silencioso) setLoadErr(false);
    try {
      const res = await fetch("/api/monitor/estudiantes", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setRows((await res.json()).rows);
      setLoadErr(false);
    } catch {
      if (!silencioso) setLoadErr(true);
    }
  }

  // Carga inicial + refresco cada 30 s (solo con la pestaña visible) y al volver a la pestaña.
  // Se reemplazan las filas en su lugar: filtros, búsqueda y posición de la página se mantienen.
  useEffect(() => {
    cargar();
    const tick = setInterval(() => { if (document.visibilityState === "visible") cargar(true); }, REFRESCO_MS);
    const onVisible = () => { if (document.visibilityState === "visible") cargar(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  useEffect(() => { filtrosAUrl(filtro, ciudad, q); }, [filtro, ciudad, q]);

  function abrirEdicion(row: MonitorRow) {
    setEdicion({ row, documento: row.documento, nombre: row.nombre, correo: row.correo, ciudad: row.ciudad, grupo: row.grupo ?? "", estado: row.estado, saving: false, error: "" });
  }

  async function guardarEdicion() {
    if (!edicion) return;
    setEdicion({ ...edicion, saving: true, error: "" });
    const { row, documento, nombre, correo, ciudad, grupo, estado } = edicion;
    try {
      const res = await fetch(`/api/admin/estudiantes/${row.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documento, nombre: cleanSpaces(nombre), correo, ciudad, grupo, estado }),
      });
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setEdicion({ ...edicion, saving: false, error: data.mensaje ?? "No se pudo guardar." });
      replaceRow(data.row);
      setEdicion(null);
      showToast("Registro actualizado ✓", true);
    } catch {
      setEdicion({ ...edicion, saving: false, error: "Sin conexión. Intenta otra vez." });
    }
  }

  async function verHistorial(row: MonitorRow) {
    setHistorial({ row, items: null, error: false });
    try {
      const res = await fetch(`/api/monitor/estudiantes/${row.id}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      setHistorial({ row, items: (await res.json()).historial, error: false });
    } catch {
      setHistorial({ row, items: null, error: true });
    }
  }

  function showToast(text: string, ok = false) {
    clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  // ----- Datos derivados -----
  const ciudades = useMemo(() => [...new Set((rows ?? []).map((r) => r.ciudad))].sort(), [rows]);
  // Una ciudad en la URL que no es del usuario se ignora.
  useEffect(() => { if (rows && ciudad && !ciudades.includes(ciudad)) setCiudad(""); }, [rows, ciudad, ciudades]);
  const enCiudad = useMemo(() => (rows ?? []).filter((r) => !ciudad || r.ciudad === ciudad), [rows, ciudad]);
  const cnt = useMemo(() => {
    const c = { validado: 0, corregido: 0, pendiente: 0 };
    for (const r of enCiudad) c[r.estado]++;
    return c;
  }, [enCiudad]);
  const total = enCiudad.length;
  const visibles = useMemo(() => {
    const t = fold(q.trim());
    return enCiudad
      .filter((r) => filtro === "all" || r.estado === filtro)
      .filter((r) => !t || fold(`${r.nombre} ${r.nombrePropuesto ?? ""} ${r.correo} ${r.correoPropuesto ?? ""} ${r.documento}`).includes(t))
      .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
  }, [enCiudad, filtro, q]);

  const kicker = ciudad || (verTodas ? "Todas las ciudades" : user.ciudades.join(" · "));
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");

  // ----- Acciones -----
  function replaceRow(row: MonitorRow) {
    setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? row : r)));
  }

  async function enviar(row: MonitorRow, body: object): Promise<{ ok: true } | { ok: false; mensaje: string }> {
    try {
      const res = await fetch(`/api/monitor/estudiantes/${row.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 401) { window.location.assign("/login"); return { ok: false, mensaje: "" }; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, mensaje: data.mensaje ?? "No se pudo guardar. Intenta otra vez." };
      replaceRow(data.row);
      return { ok: true };
    } catch {
      return { ok: false, mensaje: "Sin conexión. Intenta otra vez." };
    }
  }

  async function aprobar(row: MonitorRow) {
    setBusy(row.id);
    const r = await enviar(row, { accion: "aprobar" });
    setBusy(null);
    showToast(r.ok ? `Aprobado ✓ ${(row.nombrePropuesto ?? row.nombre).split(" ")[0]}` : r.mensaje, r.ok);
  }

  function abrir(row: MonitorRow, mode: Modal["mode"]) {
    setModal({ row, mode, nombre: row.nombrePropuesto ?? row.nombre, correo: row.correoPropuesto ?? row.correo, confirmado: false, tried: false, saving: false, error: "" });
  }

  const mCheck = modal ? checkEmail(modal.correo) : null;
  const mEmailErr = mCheck ? emailError(mCheck) : null;
  const mNameErr = modal && nameWarnings(modal.nombre).includes("incompleto") ? "Escribe nombre y apellido(s)" : "";
  const mShowEmailErr = !!modal && (modal.tried || modal.correo.includes("."));

  async function guardarModal() {
    if (!modal) return;
    const needsConfirm = modal.mode === "validar_en_nombre";
    if (mEmailErr || mNameErr || (needsConfirm && !modal.confirmado)) return setModal({ ...modal, tried: true });
    setModal({ ...modal, saving: true, error: "" });
    const r = await enviar(modal.row, {
      accion: modal.mode, nombre: cleanSpaces(modal.nombre), correo: modal.correo,
      ...(needsConfirm ? { confirmado: true } : {}),
    });
    if (!r.ok) return setModal({ ...modal, saving: false, error: r.mensaje });
    setModal(null);
    showToast(modal.mode === "editar" ? "Corregido y aprobado ✓" : "Validado por ti ✓", true);
  }

  async function copiarPendientes() {
    const p = enCiudad.filter((r) => r.estado === "pendiente").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (!p.length) return showToast("No hay pendientes");
    const txt = `Hola. Estos estudiantes todavía no validan sus datos para el certificado:\n${p.map((r) => `• ${r.nombre}`).join("\n")}\nEntren aquí con su documento: ${appUrl || window.location.origin}`;
    try {
      await navigator.clipboard.writeText(txt);
      showToast(`Lista copiada (${p.length}). Pégala en WhatsApp.`, true);
    } catch {
      // Sin permiso de portapapeles: el menú de compartir del celular es la alternativa.
      if (navigator.share) await navigator.share({ text: txt }).catch(() => null);
      else showToast("No se pudo copiar. Intenta desde otro navegador.");
    }
  }

  const filtros: [Filtro, string, number, string][] = [
    ["all", "Todos", total, "var(--ink)"],
    ["validado", "Validado", cnt.validado, STY.validado.dot],
    ["corregido", "Corregido", cnt.corregido, STY.corregido.dot],
    ["pendiente", "Pendiente", cnt.pendiente, STY.pendiente.dot],
  ];
  const em = q.trim() ? EMPTY.search : EMPTY[filtro];

  return (
    <AppShell user={user} active="estudiantes">

        <div className={s.head}>
          <div>
            <div className={s.kicker}>{kicker}</div>
            <div className={s.total}>{rows ? `${cnt.validado} de ${total} validados` : "Cargando…"}</div>
            {ciudades.length > 1 && (
              <select className={s.citySelect} value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Ciudad">
                <option value="">{verTodas ? "Todas las ciudades" : "Todas mis ciudades"}</option>
                {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>
          <button type="button" className={s.copyBtn} onClick={copiarPendientes} disabled={!rows}>
            Copiar lista de pendientes ({cnt.pendiente})
          </button>
        </div>

        <div className={s.progress} aria-hidden>
          <i style={{ width: pct(cnt.validado), background: "var(--green)" }} />
          <i style={{ width: pct(cnt.corregido), background: "var(--yellow)" }} />
        </div>

        <div className={s.filters} role="tablist">
          {filtros.map(([k, label, count, dot]) => (
            <button key={k} type="button" role="tab" aria-selected={filtro === k} className={`${s.filter} ${filtro === k ? s.filterOn : ""}`} onClick={() => setFiltro(k)}>
              <span className={s.filterLabel}><i className={s.dot} style={{ background: dot }} />{label}</span>
              <span className={s.filterCount}>{rows ? count : "–"}</span>
            </button>
          ))}
        </div>

        <label className={s.search}>
          <span className={s.searchIcon} aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, correo o documento" aria-label="Buscar" />
        </label>

        <div className={s.tableHead}><span>Estudiante</span><span>Correo</span><span>Estado</span><span>Validación</span><span /></div>

        <div className={s.list}>
          {loadErr && (
            <div className={s.empty}>
              <div className={s.emptyTitle}>No pudimos cargar la lista</div>
              <div className={s.emptyText}>Revisa tu conexión.</div>
              <button type="button" className={`${s.act} ${s.actGhost}`} onClick={() => cargar()} style={{ marginTop: 10 }}>Intentar de nuevo</button>
            </div>
          )}
          {!rows && !loadErr && (
            <div className={s.skeleton} aria-label="Cargando">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: `${90 - (i % 3) * 15}%` }} />)}</div>
          )}

          {visibles.map((r) => {
            const st = STY[r.estado];
            const corr = r.estado === "corregido";
            const nombreVisible = r.nombrePropuesto ?? r.nombre;
            const correoVisible = r.correoPropuesto ?? r.correo;
            return (
              <div key={r.id} className={s.row}>
                <div className={s.rowGrid}>
                  <div className={s.who}>
                    <i className={`${s.dot} ${s.rowMobileDot}`} style={{ background: st.dot }} />
                    <div className={s.whoText}>
                      <div className={s.name}>{nombreVisible}</div>
                      <div className={s.doc}>{r.documento}{ciudades.length > 1 && !ciudad ? ` · ${r.ciudad}` : ""}</div>
                    </div>
                  </div>
                  <div className={s.email}>{correoVisible || "(sin correo)"}</div>
                  <div className={s.state}>
                    <span className={s.badge} style={{ background: st.bg, color: st.fg }}><i className={s.dot} style={{ background: st.dot, width: 8, height: 8 }} />{st.label}</span>
                    <div className={s.fecha}>{r.estado === "pendiente" ? "" : fecha(r.fecha)}</div>
                  </div>
                  <div className={s.fechaCol}>
                    {fecha(r.fecha)}
                    {r.estado === "validado" && r.validadoPor && r.validadoPor !== "estudiante" && <div style={{ fontSize: 12, color: "var(--muted-2)" }}>por monitor</div>}
                  </div>
                  <div className={s.acts}>
                    {corr && <>
                      <button type="button" className={`${s.act} ${s.actGreen}`} onClick={() => aprobar(r)} disabled={busy === r.id}>{busy === r.id ? "…" : "Aprobar"}</button>
                      <button type="button" className={`${s.act} ${s.actGhost}`} onClick={() => abrir(r, "editar")}>Editar</button>
                    </>}
                    {r.estado === "pendiente" && (
                      <button type="button" className={`${s.act} ${s.actOrange}`} onClick={() => abrir(r, "validar_en_nombre")}>Validar por el estudiante</button>
                    )}
                    {r.estado === "validado" && (
                      <button type="button" className={`${s.act} ${s.actLink}`} onClick={() => abrir(r, "editar")}>Corregir</button>
                    )}
                    {editarTodo && (
                      <button type="button" className={`${s.act} ${s.actLink}`} onClick={() => abrirEdicion(r)}>Editar todo</button>
                    )}
                    {verHist && (
                      <button type="button" className={`${s.act} ${s.actLink}`} onClick={() => verHistorial(r)}>Historial</button>
                    )}
                  </div>
                </div>

                {(r.avisos.correoRepetido || r.avisos.correoInstitucional || r.avisos.correoInvalido) && (
                  <div className={s.chips}>
                    {r.avisos.correoInstitucional && <span className={s.chip}>Correo institucional</span>}
                    {r.avisos.correoInvalido && <span className={s.chip}>Correo inválido</span>}
                    {r.avisos.correoRepetido && <span className={`${s.chip} ${s.chipWarn}`}>Correo repetido con otro estudiante</span>}
                  </div>
                )}

                {corr && (
                  <div className={s.diff}>
                    <div className={s.before}>
                      <div className={s.diffLabel}>ANTES</div>
                      <div className={`${s.dName} ${r.nombre !== nombreVisible ? s.struck : ""}`}>{r.nombre}</div>
                      <div className={`${s.dMail} ${r.correo !== correoVisible ? s.struck : ""}`}>{r.correo || "(sin correo)"}</div>
                    </div>
                    <div className={s.after}>
                      <div className={s.diffLabel}>AHORA</div>
                      <div className={s.dName}><Cambio antes={r.nombre} ahora={nombreVisible} /></div>
                      <div className={s.dMail}><Cambio antes={r.correo} ahora={correoVisible} /></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {rows && !loadErr && visibles.length === 0 && (
            <div className={s.empty}>
              <div className={s.emptyIcon} style={{ background: em[3], color: em[4] }}>{em[0]}</div>
              <div className={s.emptyTitle}>{em[1]}</div>
              <div className={s.emptyText}>{em[2]}</div>
            </div>
          )}
        </div>

      {modal && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && !modal.saving && setModal(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div id="modal-title" className={s.modalTitle}>{modal.mode === "editar" ? (modal.row.estado === "corregido" ? "Editar corrección" : "Corregir datos") : "Validar por el estudiante"}</div>
            <div className={s.modalSub}>
              {modal.mode === "editar" ? "Ajusta lo que haga falta y guarda: quedará validado." : "Confirma los datos con el estudiante (llamada o WhatsApp) antes de guardar."}
            </div>
            <div className={s.modalField}>
              <label className="label" htmlFor="m-nombre">Nombre completo</label>
              <input id="m-nombre" className={`input ${modal.tried && mNameErr ? "is-error" : ""}`} value={modal.nombre} onChange={(e) => setModal({ ...modal, nombre: e.target.value })} />
              {modal.tried && mNameErr && <div className="msg-error">{mNameErr}</div>}
              {!mNameErr && nameWarnings(modal.nombre).includes("sin_tildes") && <div className="msg-warn">No tiene ninguna tilde. ¿Está bien escrito?</div>}
            </div>
            <div className={s.modalField} style={{ display: "flex", flexDirection: "column" }}>
              <label className="label" htmlFor="m-correo">Correo personal</label>
              <input id="m-correo" type="email" className={`input ${mShowEmailErr && mEmailErr ? "is-error" : mCheck?.suggestion ? "is-warn" : ""}`} value={modal.correo} onChange={(e) => setModal({ ...modal, correo: e.target.value })} />
              {mShowEmailErr && mEmailErr && <div className="msg-error">{mEmailErr}</div>}
              {!mEmailErr && mCheck?.suggestion && (
                <button type="button" className={s.suggest} onClick={() => setModal({ ...modal, correo: mCheck.suggestion! })}>¿Quisiste decir {domainOf(mCheck.suggestion)}? Usar</button>
              )}
            </div>
            {modal.mode === "validar_en_nombre" && (
              <div style={{ marginTop: 18 }}>
                <button type="button" role="checkbox" aria-checked={modal.confirmado} className={`check ${modal.confirmado ? "is-on" : ""} ${modal.tried && !modal.confirmado ? "is-error" : ""}`} onClick={() => setModal({ ...modal, confirmado: !modal.confirmado })}>
                  <span className="check-box">{modal.confirmado ? "✓" : ""}</span>
                  <span>El estudiante confirmó que es su correo personal</span>
                </button>
                {modal.tried && !modal.confirmado && <div className="msg-error">Marca la casilla para continuar</div>}
              </div>
            )}
            {modal.error && <div className="msg-error" style={{ marginTop: 12 }}>{modal.error}</div>}
            <div className={s.modalActions}>
              <button type="button" className={s.cancel} onClick={() => setModal(null)} disabled={modal.saving}>Cancelar</button>
              <button type="button" className={s.save} onClick={guardarModal} disabled={modal.saving}>{modal.saving ? "Guardando…" : "Guardar como validado"}</button>
            </div>
          </div>
        </div>
      )}

      {edicion && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && !edicion.saving && setEdicion(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="ed-title">
            <div id="ed-title" className={s.modalTitle}>Editar registro</div>
            <div className={s.modalSub}>Cambios de administración: quedan en el historial. El documento no puede repetirse con otro estudiante.</div>
            <div className={s.modalField}>
              <label className="label" htmlFor="e-doc">Documento</label>
              <input id="e-doc" className="input" inputMode="numeric" value={edicion.documento} onChange={(e) => setEdicion({ ...edicion, documento: e.target.value })} />
            </div>
            <div className={s.modalField}>
              <label className="label" htmlFor="e-nombre">Nombre completo</label>
              <input id="e-nombre" className="input" value={edicion.nombre} onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })} />
            </div>
            <div className={s.modalField}>
              <label className="label" htmlFor="e-correo">Correo</label>
              <input id="e-correo" type="email" className="input" value={edicion.correo} onChange={(e) => setEdicion({ ...edicion, correo: e.target.value })} />
              {edicion.row.correoPropuesto && edicion.estado === "corregido" && <div className="msg-warn">El estudiante propuso {edicion.row.correoPropuesto}; se conserva mientras siga “Corregido”.</div>}
            </div>
            <div className={s.editGrid}>
              <div>
                <label className="label" htmlFor="e-ciudad">Ciudad</label>
                <input id="e-ciudad" className="input" list="e-ciudades" value={edicion.ciudad} onChange={(e) => setEdicion({ ...edicion, ciudad: e.target.value })} />
                <datalist id="e-ciudades">{ciudades.map((c) => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="label" htmlFor="e-grupo">Grupo</label>
                <input id="e-grupo" className="input" value={edicion.grupo} onChange={(e) => setEdicion({ ...edicion, grupo: e.target.value })} />
              </div>
            </div>
            <div className={s.modalField}>
              <label className="label" htmlFor="e-estado">Estado</label>
              <select id="e-estado" className={`input ${s.select}`} value={edicion.estado} onChange={(e) => setEdicion({ ...edicion, estado: e.target.value as Estado })}>
                <option value="pendiente">Pendiente</option>
                <option value="corregido">Corregido (por revisar)</option>
                <option value="validado">Validado</option>
              </select>
            </div>
            {edicion.error && <div className="msg-error" style={{ marginTop: 12 }}>{edicion.error}</div>}
            <div className={s.modalActions}>
              <button type="button" className={s.cancel} onClick={() => setEdicion(null)} disabled={edicion.saving}>Cancelar</button>
              <button type="button" className={s.save} onClick={guardarEdicion} disabled={edicion.saving}>{edicion.saving ? "Guardando…" : "Guardar cambios"}</button>
            </div>
          </div>
        </div>
      )}

      {historial && (
        <div className={s.overlay} onClick={(e) => e.target === e.currentTarget && setHistorial(null)}>
          <div className={s.modal} role="dialog" aria-modal="true" aria-labelledby="hist-title">
            <div id="hist-title" className={s.modalTitle}>Historial de cambios</div>
            <div className={s.histWho}>
              {historial.row.nombrePropuesto ?? historial.row.nombre} · <span className={s.doc}>{historial.row.documento}</span> · {historial.row.ciudad}
            </div>
            {historial.error && <div className="msg-error">No pudimos cargar el historial.</div>}
            {!historial.items && !historial.error && <div className={s.skeleton}><i /><i style={{ width: "70%" }} /><i /></div>}
            {historial.items?.length === 0 && <div className={s.emptyText} style={{ padding: "18px 0" }}>Sin cambios todavía: el registro está como se importó.</div>}
            {historial.items && historial.items.length > 0 && (
              <ol className={s.hist}>
                {agruparHistorial(historial.items).map((g) => (
                  <li key={g.key} className={s.histItem}>
                    <div className={s.histHead}><b>{ACCION_TXT[g.accion] ?? g.accion}</b><span>{fecha(g.fecha)}</span></div>
                    <div className={s.histActor}>{actorTxt(g.actor)}</div>
                    {g.cambios.map((c, i) => (
                      <div key={i} className={s.histChange}>
                        <span className={s.histField}>{CAMPO_TXT[c.campo]}</span>
                        {c.campo === "estado" ? (
                          <>{STY[c.anterior as Estado]?.label ?? c.anterior} → <b>{STY[c.nuevo as Estado]?.label ?? c.nuevo}</b></>
                        ) : (
                          <><span className={s.struck}>{c.anterior || "(vacío)"}</span> → <b>{c.nuevo}</b></>
                        )}
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            )}
            <div className={s.modalActions} style={{ gridTemplateColumns: "1fr" }}>
              <button type="button" className={s.cancel} onClick={() => setHistorial(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`${s.toast} ${toast.ok ? s.toastOk : ""}`} role="status">{toast.text}</div>}
    </AppShell>
  );
}
