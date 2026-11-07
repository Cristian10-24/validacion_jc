"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { ComentarioVista, DatosPanel, EstadoClausura, FilaClausura } from "@/lib/clausura/panel";
import { buscarEncuesta } from "@/lib/encuesta/orden";
import { puede, ROL_TXT, type RolUsuario } from "@/lib/permisos";
import { soloActivos, visiblesSegunFiltro } from "@/lib/activo";
import AppShell from "./AppShell";
import MenuFila from "./MenuFila";
import { DialogoActivo, EtiquetaInactivo, FiltroInactivos, estilosInactivos as si, type Persona } from "./Inactivos";
import m from "./MonitorPanel.module.css";
import t from "./TestimoniosPanel.module.css";
import c from "./ClausuraPanel.module.css";
import { descargarExcel } from "./ClausuraResumen";

// Seguimiento de la clausura: quién respondió, si asistirá y comentarios de los monitores.

type Filtro = "all" | EstadoClausura;
export type FiltrosClausura = { evento: string; estado: string; asistencia: string; ciudad: string; q: string };
const FILTROS: Filtro[] = ["all", "respondio", "en_progreso", "sin_responder"];
const REFRESCO_MS = 30_000;

const STY: Record<EstadoClausura, { label: string; bg: string; fg: string; dot: string }> = {
  respondio: { label: "Respondió", bg: "var(--green-soft)", fg: "var(--green-dark)", dot: "var(--green)" },
  en_progreso: { label: "En progreso", bg: "var(--yellow-soft)", fg: "var(--yellow-text)", dot: "var(--yellow)" },
  sin_responder: { label: "Sin responder", bg: "var(--red-soft)", fg: "var(--red-dark)", dot: "var(--red)" },
};
const ORDEN: Record<EstadoClausura, number> = { sin_responder: 0, en_progreso: 1, respondio: 2 };

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso), tz = "America/Bogota";
  const dia = d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "");
  const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "");
  return `${dia === hoy ? "Hoy" : dia} · ${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;
}

function aUrl(f: FiltrosClausura) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v && !(k === "estado" && v === "all")) p.set(k, v.trim());
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
}

export default function ClausuraPanel({ user, inicial }: { user: SessionUser; inicial: FiltrosClausura }) {
  const [datos, setDatos] = useState<DatosPanel | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [evento, setEvento] = useState(inicial.evento);
  const [filtro, setFiltro] = useState<Filtro>(FILTROS.includes(inicial.estado as Filtro) ? (inicial.estado as Filtro) : "all");
  const [asis, setAsis] = useState(inicial.asistencia);
  const [ciudad, setCiudad] = useState(inicial.ciudad);
  const [q, setQ] = useState(inicial.q);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorNota, setErrorNota] = useState("");
  const [edicion, setEdicion] = useState<{ id: string; texto: string } | null>(null);
  const [errorEdicion, setErrorEdicion] = useState("");
  const [toast, setToast] = useState<{ text: string; ok?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const eventoRef = useRef(evento);
  eventoRef.current = evento;
  const verTodas = puede(user.rol, "ver_todas_las_ciudades");
  const puedeComentar = puede(user.rol, "clausura_comentar");
  const puedeReabrir = puede(user.rol, "clausura_gestionar");
  const puedeExportar = puede(user.rol, "clausura_exportar");
  const [exportando, setExportando] = useState(false);
  const cambiarActivo = puede(user.rol, "estudiantes_activo");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [dlgActivo, setDlgActivo] = useState<Persona | null>(null);

  /** Excel del evento elegido, con quienes no han respondido (monitor: solo sus ciudades, lo filtra el servidor). */
  async function exportar() {
    if (!datos?.evento) return;
    setExportando(true);
    try {
      const r = await descargarExcel(datos.evento.id, true, mostrarInactivos);
      aviso(`Excel descargado ✓ (${r.filas} filas)`, true);
    } catch {
      aviso("No se pudo generar el Excel. Intenta otra vez.");
    }
    setExportando(false);
  }

  async function cargar(silencioso = false) {
    if (!silencioso) setLoadErr(false);
    try {
      const res = await fetch(`/api/clausura/panel${eventoRef.current ? `?evento=${encodeURIComponent(eventoRef.current)}` : ""}`, { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      const d = (await res.json()) as DatosPanel;
      setDatos(d);
      if (d.evento && d.evento.id !== eventoRef.current) setEvento(d.evento.id);
      setLoadErr(false);
    } catch {
      if (!silencioso) setLoadErr(true);
    }
  }
  useEffect(() => {
    const tick = setInterval(() => { if (document.visibilityState === "visible") cargar(true); }, REFRESCO_MS);
    const onVisible = () => { if (document.visibilityState === "visible") cargar(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [evento]);
  useEffect(() => { aUrl({ evento, estado: filtro, asistencia: asis, ciudad, q }); }, [evento, filtro, asis, ciudad, q]);

  function aviso(text: string, ok = false) {
    clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const filas = datos?.filas ?? null;
  const ciudades = useMemo(() => [...new Set((filas ?? []).map((f) => f.ciudad))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  const enCiudad = useMemo(() => (filas ?? []).filter((f) => !ciudad || f.ciudad === ciudad), [filas, ciudad]);
  // Los inactivos no cuentan en totales ni porcentajes; solo se ven con "Mostrar inactivos".
  const activosCiudad = useMemo(() => soloActivos(enCiudad), [enCiudad]);
  const nInactivos = enCiudad.length - activosCiudad.length;
  const buscadas = useMemo(() => buscarEncuesta(visiblesSegunFiltro(enCiudad, mostrarInactivos), q), [enCiudad, q, mostrarInactivos]);
  const cnt = useMemo(() => {
    const e: Record<EstadoClausura, number> = { respondio: 0, en_progreso: 0, sin_responder: 0 };
    const a = new Map<string, number>();
    for (const f of activosCiudad) {
      e[f.estado]++;
      const k = f.asistencia?.id ?? "";
      a.set(k, (a.get(k) ?? 0) + 1);
    }
    return { e, a };
  }, [activosCiudad]);
  const visibles = useMemo(() => buscadas
    .filter((f) => (filtro === "all" || f.estado === filtro) && (!asis || (asis === "sin" ? !f.asistencia : f.asistencia?.id === asis)))
    .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })), [buscadas, filtro, asis]);
  const total = activosCiudad.length;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  const abierta = filas?.find((f) => f.id === detalle) ?? null;
  const ev = datos?.evento ?? null;

  function actualizarComentarios(id: string, fn: (cs: ComentarioVista[]) => ComentarioVista[]) {
    setDatos((d) => (d ? { ...d, filas: d.filas.map((f) => (f.id !== id ? f : { ...f, comentarios: fn(f.comentarios) })) } : d));
  }

  async function agregarComentario() {
    if (!abierta || !ev || !texto.trim()) return;
    setGuardando(true);
    setErrorNota("");
    try {
      const res = await fetch(`/api/clausura/panel/${abierta.id}/comentarios?evento=${ev.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje ?? "No se pudo guardar el comentario.");
      actualizarComentarios(abierta.id, (cs) => [...cs, data.comentario as ComentarioVista]);
      setTexto("");
      aviso("Comentario guardado ✓", true);
    } catch (e) {
      setErrorNota(e instanceof Error ? e.message : "No se pudo guardar el comentario.");
    }
    setGuardando(false);
  }

  /** Solo admin: el estudiante podrá editar y deberá volver a enviar. Queda en la auditoría. */
  async function reabrir() {
    if (!abierta || !ev) return;
    if (!window.confirm(`¿Reabrir la respuesta de ${abierta.nombre}? Podrá cambiarla y deberá volver a enviarla.`)) return;
    setGuardando(true);
    try {
      const res = await fetch(`/api/clausura/panel/${abierta.id}/reabrir?evento=${ev.id}`, { method: "POST" });
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje ?? "No se pudo reabrir.");
      setDatos((d) => (d ? { ...d, filas: d.filas.map((f) => (f.id === abierta.id ? { ...f, reabierta: data.reabierta } : f)) } : d));
      aviso("Respuesta reabierta ✓", true);
    } catch (e) {
      aviso(e instanceof Error ? e.message : "No se pudo reabrir.");
    }
    setGuardando(false);
  }

  async function guardarEdicion() {
    if (!abierta || !ev || !edicion || !edicion.texto.trim()) return;
    setGuardando(true);
    setErrorEdicion("");
    try {
      const res = await fetch(`/api/clausura/panel/${abierta.id}/comentarios/${edicion.id}?evento=${ev.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: edicion.texto }) });
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje ?? "No se pudo guardar el cambio.");
      const editado = data.comentario as ComentarioVista;
      actualizarComentarios(abierta.id, (cs) => cs.map((x) => (x.id === editado.id ? editado : x)));
      setEdicion(null);
      aviso("Comentario editado ✓", true);
    } catch (e) {
      setErrorEdicion(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    }
    setGuardando(false);
  }

  const filtros: [Filtro, string, number, string][] = [
    ["all", "Todos", total, "var(--ink)"],
    ["respondio", "Respondieron", cnt.e.respondio, STY.respondio.dot],
    ["en_progreso", "En progreso", cnt.e.en_progreso, STY.en_progreso.dot],
    ["sin_responder", "Sin responder", cnt.e.sin_responder, STY.sin_responder.dot],
  ];
  const kicker = ciudad || (verTodas ? "Todas las ciudades" : user.ciudades.join(" · "));
  const fila = (f: FilaClausura) => {
    const st = STY[f.estado];
    return (
      <div key={f.id} className={`${t.row} ${f.inactivo ? si.filaInactiva : ""}`}>
        <div className={t.rowGrid}>
          <div className={t.who}>
            <i className={`${t.dot} ${t.mobileDot}`} style={{ background: st.dot }} />
            <div className={t.whoText}>
              <div className={t.name}>{f.nombre} <EtiquetaInactivo info={f.inactivo} /></div>
              <div className={t.doc}>{f.documento} · {f.ciudad}{f.grupo ? ` · ${f.grupo}` : ""}</div>
            </div>
          </div>
          <div className={t.contact}>
            <span>{f.celular || "(sin celular)"}</span>
            <span>{f.whatsapp ? `WhatsApp: ${f.whatsapp}` : ""}</span>
          </div>
          <div className={t.state}>
            <span className={t.badge} style={{ background: st.bg, color: st.fg }}><i className={t.dot} style={{ background: st.dot, width: 8, height: 8 }} />{st.label}</span>
          </div>
          <div className={t.envio}>
            {f.asistencia ? <b>{f.asistencia.texto}</b> : "—"}
            {f.proyecto && <span className={c.proyecto} data-presenta={f.proyecto.presenta}>{f.proyecto.presenta ? `Presenta proyecto${f.proyecto.nombre ? `: ${f.proyecto.nombre}` : ""}` : "No presenta proyecto"}</span>}
            <span className={t.por}>{f.actualizada ? `Actualizado ${fecha(f.actualizada)}` : ""}</span>
          </div>
          <div className={t.acts}>
            <button type="button" className={`${t.act} ${f.comentarios.length ? t.actComentarios : t.actGhost}`} onClick={() => { setDetalle(f.id); setTexto(""); setErrorNota(""); setEdicion(null); setErrorEdicion(""); }}>
              Ver{f.comentarios.length ? ` · ${f.comentarios.length} coment.` : ""}
            </button>
            <MenuFila abierto={menu === f.id} onToggle={() => setMenu(menu === f.id ? null : f.id)} onCerrar={() => setMenu(null)} nombre={f.nombre}
              items={cambiarActivo ? [{ label: f.inactivo ? "Reactivar" : "Inactivar", on: () => setDlgActivo({ documento: f.documento, nombre: f.nombre, inactivo: f.inactivo }) }] : []} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <AppShell user={user} active="clausura">
      <div className={m.head}>
        <div>
          <div className={m.kicker}>Clausura · {kicker}</div>
          <div className={m.total}>{filas ? `${cnt.e.respondio} de ${total} respondieron` : "Cargando…"}</div>
          {(datos?.eventos.length ?? 0) > 1 && (
            <select className={m.citySelect} value={evento} onChange={(e) => { setEvento(e.target.value); setDetalle(null); setAsis(""); }} aria-label="Evento">
              {datos!.eventos.map((e) => <option key={e.id} value={e.id}>{e.nombreVisible} · {e.titulo}{e.estado !== "abierto" ? ` (${e.estado})` : ""}</option>)}
            </select>
          )}
          {ciudades.length > 1 && (
            <select className={m.citySelect} value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Ciudad">
              <option value="">{verTodas ? "Todas las ciudades" : "Todas mis ciudades"}</option>
              {ciudades.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
        </div>
        {ev && (
          <div className={c.evento}>
            <span className={c.estadoEvento} data-estado={ev.estado}>{ev.estado === "abierto" ? "Abierto" : ev.estado === "cerrado" ? "Cerrado" : "Borrador"}</span>
            <a href={`/clausura/${ev.slug}`} target="_blank" rel="noreferrer">/clausura/{ev.slug}</a>
            {puedeExportar && <button type="button" className={m.copyBtn} disabled={exportando} onClick={exportar}>{exportando ? "Generando…" : "Descargar Excel"}</button>}
          </div>
        )}
      </div>

      {datos && !datos.evento && (
        <div className={m.empty}><div className={m.emptyTitle}>Todavía no hay eventos</div><div className={m.emptyText}>Cuando se publique la clausura de tu ciudad aparecerá aquí.</div></div>
      )}

      {datos?.evento && (
        <>
          <div className={m.progress} aria-hidden>
            <i style={{ width: pct(cnt.e.respondio), background: "var(--green)" }} />
            <i style={{ width: pct(cnt.e.en_progreso), background: "var(--yellow)" }} />
          </div>

          <div className={m.filters} role="tablist">
            {filtros.map(([k, label, count, dot]) => (
              <button key={k} type="button" role="tab" aria-selected={filtro === k} className={`${m.filter} ${filtro === k ? m.filterOn : ""}`} onClick={() => setFiltro(k)}>
                <span className={m.filterLabel}><i className={m.dot} style={{ background: dot }} />{label}</span>
                <span className={m.filterCount}>{filas ? count : "–"}</span>
              </button>
            ))}
          </div>

          {datos.asistencia && (
            <div className={c.asistencia} role="group" aria-label={datos.asistencia.titulo}>
              <span className={c.asistenciaTitulo}>{datos.asistencia.titulo}</span>
              {[...datos.asistencia.opciones, { id: "sin", texto: "Sin respuesta" }].map((o) => {
                const n = cnt.a.get(o.id === "sin" ? "" : o.id) ?? 0;
                const on = asis === o.id;
                return <button key={o.id} type="button" aria-pressed={on} className={`${c.chip} ${on ? c.chipOn : ""}`} onClick={() => setAsis(on ? "" : o.id)}>{o.texto} <b>{n}</b></button>;
              })}
            </div>
          )}

          <label className={m.search}>
            <span className={m.searchIcon} aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, documento, correo o celular" aria-label="Buscar" />
          </label>
          {(nInactivos > 0 || mostrarInactivos) && (
            <div style={{ margin: "10px 0 4px" }}><FiltroInactivos valor={mostrarInactivos} onCambio={setMostrarInactivos} cuantos={nInactivos} /></div>
          )}

          <div className={t.tableHead}><span>Estudiante</span><span>Contacto</span><span>Estado</span><span>Asistencia</span><span /></div>
        </>
      )}

      <div className={m.list}>
        {loadErr && (
          <div className={m.empty}>
            <div className={m.emptyTitle}>No pudimos cargar la lista</div>
            <div className={m.emptyText}>Revisa tu conexión.</div>
            <button type="button" className={`${t.act} ${t.actGhost}`} onClick={() => cargar()} style={{ marginTop: 10 }}>Intentar de nuevo</button>
          </div>
        )}
        {!datos && !loadErr && <div className={m.skeleton} aria-label="Cargando">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: `${90 - (i % 3) * 15}%` }} />)}</div>}
        {visibles.map(fila)}
        {datos?.evento && !loadErr && visibles.length === 0 && (
          <div className={m.empty}>
            <div className={m.emptyIcon} style={{ background: "#F5F2EF", color: "var(--muted-2)" }}>∅</div>
            <div className={m.emptyTitle}>{q.trim() ? "No encontramos a nadie" : "Nadie en este filtro"}</div>
            <div className={m.emptyText}>{q.trim() ? "Prueba con el documento, el celular o un apellido." : "Cambia el filtro para ver a los demás."}</div>
          </div>
        )}
      </div>

      {abierta && (
        <div className={m.overlay} onClick={(e) => e.target === e.currentTarget && !guardando && setDetalle(null)}>
          <div className={m.modal} role="dialog" aria-modal="true" aria-labelledby="c-det">
            <div id="c-det" className={m.modalTitle}>{abierta.nombre}</div>
            <dl className={t.info}>
              <dt>Clausura</dt><dd>
                <span className={t.badge} style={{ background: STY[abierta.estado].bg, color: STY[abierta.estado].fg }}>{STY[abierta.estado].label}</span>
                {abierta.editando && <span className={t.tagComentarios}>Editando sus respuestas</span>}
                {abierta.reabierta && <span className={t.tagComentarios}>Reabierta por {abierta.reabierta.por} · {fecha(abierta.reabierta.en)}</span>}
                {puedeReabrir && abierta.estado === "respondio" && !abierta.reabierta && (
                  <button type="button" className={`${t.act} ${t.actGhost}`} style={{ marginLeft: 8 }} onClick={reabrir} disabled={guardando}>Reabrir respuesta</button>
                )}
              </dd>
              {abierta.enviadaEn && <><dt>Envió</dt><dd>{fecha(abierta.enviadaEn)}</dd></>}
              {abierta.actualizada && <><dt>Última actualización</dt><dd>{fecha(abierta.actualizada)}</dd></>}
              <dt>Documento</dt><dd>{abierta.documento}</dd>
              <dt>Ciudad · grupo</dt><dd>{abierta.ciudad}{abierta.grupo ? ` · ${abierta.grupo}` : ""}</dd>
              <dt>Correo</dt><dd>{abierta.correo || "—"}{abierta.correoCambio ? " (nuevo, lo cambió en la clausura)" : ""}</dd>
              <dt>Celular</dt><dd>{abierta.celular || "—"}</dd>
              <dt>WhatsApp</dt><dd>{abierta.whatsapp || "—"}</dd>
              <dt>Género</dt><dd>{abierta.genero || "—"}</dd>
              {abierta.proyecto && <><dt>Proyecto</dt><dd>{abierta.proyecto.presenta ? `Presenta${abierta.proyecto.nombre ? `: ${abierta.proyecto.nombre}` : ""}` : "No presenta"}</dd></>}
            </dl>

            {abierta.secciones.length > 0 && (
              <>
                <div className={t.secTitle}>Respuestas</div>
                {abierta.secciones.map((s) => (
                  <div key={s.id} className={c.seccion}>
                    <div className={c.seccionTitulo}>{s.titulo}</div>
                    <dl className={c.respuestas}>
                      {s.preguntas.map((p) => <div key={p.id}><dt>{p.titulo}</dt><dd>{p.texto || "—"}</dd></div>)}
                    </dl>
                  </div>
                ))}
              </>
            )}

            <div className={t.secTitle}>Comentarios {abierta.comentarios.length ? `(${abierta.comentarios.length})` : ""}</div>
            {abierta.comentarios.length === 0 ? <div className={t.vacio}>Sin comentarios todavía.</div> : (
              <ol className={t.notas}>
                {abierta.comentarios.map((x) => {
                  const propio = puedeComentar && x.autor.usuario === user.usuario;
                  const editando = edicion?.id === x.id;
                  return (
                    <li key={x.id} className={t.nota}>
                      <div className={t.notaHead}>
                        {x.autor.nombre} · {ROL_TXT[x.autor.rol as RolUsuario] ?? x.autor.rol}
                        <span>{fecha(x.fecha)}{x.editadoEn && <span className={t.editado}> · Editado · {fecha(x.editadoEn)}</span>}</span>
                      </div>
                      {editando ? (
                        <div className={t.form}>
                          <textarea className={t.textarea} value={edicion.texto} maxLength={1000} onChange={(e) => setEdicion({ id: x.id, texto: e.target.value })} aria-label="Editar comentario" autoFocus />
                          {errorEdicion && <div className="msg-error">{errorEdicion}</div>}
                          <div className={t.formRow}>
                            <span className={t.cuenta}>{edicion.texto.length}/1000</span>
                            <span className={t.editActs}>
                              <button type="button" className={`${t.act} ${t.actGhost}`} onClick={() => { setEdicion(null); setErrorEdicion(""); }} disabled={guardando}>Cancelar</button>
                              <button type="button" className={t.addBtn} onClick={guardarEdicion} disabled={guardando || !edicion.texto.trim() || edicion.texto.trim() === x.texto}>{guardando ? "Guardando…" : "Guardar"}</button>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={t.notaTexto}>{x.texto}</div>
                          {propio && !edicion && <button type="button" className={t.editarBtn} onClick={() => { setEdicion({ id: x.id, texto: x.texto }); setErrorEdicion(""); }}>Editar</button>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {puedeComentar && !edicion && (
              <div className={t.form}>
                <textarea className={t.textarea} value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Le escribí por WhatsApp, confirma mañana." aria-label="Nuevo comentario" />
                {errorNota && <div className="msg-error">{errorNota}</div>}
                <div className={t.formRow}>
                  <span className={t.cuenta}>{texto.length}/1000</span>
                  <button type="button" className={t.addBtn} onClick={agregarComentario} disabled={guardando || !texto.trim()}>{guardando ? "Guardando…" : "Agregar comentario"}</button>
                </div>
              </div>
            )}
            <div className={m.modalActions} style={{ gridTemplateColumns: "1fr" }}>
              <button type="button" className={m.cancel} onClick={() => setDetalle(null)} disabled={guardando}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {dlgActivo && (
        <DialogoActivo persona={dlgActivo} onCerrar={() => setDlgActivo(null)}
          onListo={(activo) => { const n = dlgActivo.nombre.split(" ")[0]; setDlgActivo(null); cargar(true); aviso(activo ? `${n} quedó activo ✓` : `${n} quedó inactivo`, true); }} />
      )}

      {toast && <div className={`${m.toast} ${toast.ok ? m.toastOk : ""}`} role="status">{toast.text}</div>}
    </AppShell>
  );
}
