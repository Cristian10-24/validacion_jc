"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { buscarEncuesta, compararEncuesta } from "@/lib/encuesta/orden";
import type { ComentarioVista, EstadoEncuesta, FilaEncuesta } from "@/lib/encuesta/vista";
import { puede, ROL_TXT, type RolUsuario } from "@/lib/permisos";
import { celularConIndicativo } from "@/lib/testimonios/celular";
import { ultimaActividad } from "@/lib/testimonios/estado";
import { soloActivos, visiblesSegunFiltro } from "@/lib/activo";
import AppShell from "./AppShell";
import { EtiquetaInactivo, FiltroInactivos, estilosInactivos as si } from "./Inactivos";
import m from "./MonitorPanel.module.css";
import t from "./TestimoniosPanel.module.css";

// Encuesta final: misma lista de participantes y mismos filtros que Testimonios, pero solo dice si respondió o no.

/** "comentarios" = pendientes con comentarios (un subconjunto de Pendiente, no un estado). */
type Filtro = "all" | EstadoEncuesta | "comentarios";
export type FiltrosEncuesta = { estado: string; ciudad: string; q: string };
const FILTROS: Filtro[] = ["all", "respondio", "pendiente", "comentarios"];
const filtroInicial = (e: string): Filtro => (FILTROS.includes(e as Filtro) ? (e as Filtro) : "all");
const REFRESCO_MS = 30_000;

const STY: Record<EstadoEncuesta, { label: string; bg: string; fg: string; dot: string }> = {
  respondio: { label: "Respondió", bg: "var(--green-soft)", fg: "var(--green-dark)", dot: "var(--green)" },
  pendiente: { label: "No ha respondido", bg: "var(--red-soft)", fg: "var(--red-dark)", dot: "var(--red)" },
};
const POR: Record<string, string> = { documento: "por documento", correo: "por correo" };
const EMPTY: Record<Filtro | "search", [string, string, string]> = {
  pendiente: ["✓", "¡Todos respondieron!", "No queda nadie por responder la encuesta."],
  comentarios: ["∅", "Ningún pendiente tiene comentarios", "Al contactar a alguien, deja un comentario desde \"Comentarios\"."],
  respondio: ["∅", "Aún no llegan respuestas", "Cuando un participante responda la encuesta aparecerá aquí."],
  all: ["∅", "Sin participantes", "No hay participantes en tu ciudad."],
  search: ["∅", "No encontramos a nadie", "Prueba con el documento, el celular o un apellido."],
};

function fecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso), tz = "America/Bogota";
  const dia = d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "");
  const hoy = new Date().toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: tz }).replace(".", "");
  return `${dia === hoy ? "Hoy" : dia} · ${d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: tz })}`;
}

/** La fila con sus comentarios nuevos: recalcula la etiqueta y la actividad más reciente (creación o edición). */
function conComentariosNuevos(f: FilaEncuesta, comentarios: ComentarioVista[]): FilaEncuesta {
  const ua = ultimaActividad(comentarios);
  return { ...f, comentarios, conComentarios: comentarios.length > 0, ultimoComentario: ua?.ms ?? null, ultimoComentarioEditado: ua?.editado ?? false };
}

function filtrosAUrl(filtro: Filtro, ciudad: string, q: string) {
  const p = new URLSearchParams();
  if (filtro !== "all") p.set("estado", filtro);
  if (ciudad) p.set("ciudad", ciudad);
  if (q.trim()) p.set("q", q.trim());
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
  if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", url);
}

export default function EncuestaPanel({ user, inicial }: { user: SessionUser; inicial: FiltrosEncuesta }) {
  const [filas, setFilas] = useState<FilaEncuesta[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>(filtroInicial(inicial.estado));
  const [q, setQ] = useState(inicial.q);
  const [ciudad, setCiudad] = useState(inicial.ciudad);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [errorNota, setErrorNota] = useState("");
  const [edicion, setEdicion] = useState<{ id: string; texto: string } | null>(null);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [errorEdicion, setErrorEdicion] = useState("");
  const [toast, setToast] = useState<{ text: string; ok?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const verTodas = puede(user.rol, "ver_todas_las_ciudades");
  const puedeComentar = puede(user.rol, "encuesta_comentar");

  async function cargar(silencioso = false) {
    if (!silencioso) setLoadErr(false);
    try {
      const res = await fetch("/api/encuesta", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setFilas((await res.json()).filas);
      setLoadErr(false);
    } catch {
      if (!silencioso) setLoadErr(true);
    }
  }
  useEffect(() => {
    cargar();
    const tick = setInterval(() => { if (document.visibilityState === "visible") cargar(true); }, REFRESCO_MS);
    const onVisible = () => { if (document.visibilityState === "visible") cargar(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  useEffect(() => { filtrosAUrl(filtro, ciudad, q); }, [filtro, ciudad, q]);

  function aviso(text: string, ok = false) {
    clearTimeout(toastTimer.current);
    setToast({ text, ok });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  const ciudades = useMemo(() => [...new Set((filas ?? []).map((f) => f.ciudad))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  useEffect(() => { if (filas && ciudad && !ciudades.includes(ciudad)) setCiudad(""); }, [filas, ciudad, ciudades]);
  const enCiudad = useMemo(() => (filas ?? []).filter((f) => !ciudad || f.ciudad === ciudad), [filas, ciudad]);
  // Los inactivos no cuentan en totales ni porcentajes; solo se ven con "Mostrar inactivos".
  const activosCiudad = useMemo(() => soloActivos(enCiudad), [enCiudad]);
  const nInactivos = enCiudad.length - activosCiudad.length;
  const buscadas = useMemo(() => buscarEncuesta(visiblesSegunFiltro(enCiudad, mostrarInactivos), q), [enCiudad, q, mostrarInactivos]);
  const cnt = useMemo(() => {
    const c = { respondio: 0, pendiente: 0, comentarios: 0 };
    for (const f of activosCiudad) {
      c[f.estado]++;
      if (f.estado === "pendiente" && f.conComentarios) c.comentarios++;
    }
    return c;
  }, [activosCiudad]);
  const visibles = useMemo(() => buscadas.filter((f) =>
    filtro === "all" || (filtro === "comentarios" ? f.estado === "pendiente" && f.conComentarios : f.estado === filtro)).sort(compararEncuesta), [buscadas, filtro]);
  const pendientes = useMemo(() => soloActivos(buscadas).filter((f) => f.estado === "pendiente").sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [buscadas]);
  const total = activosCiudad.length;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : "0%");
  const abierta = filas?.find((f) => f.id === detalle) ?? null;

  async function copiarPendientes() {
    if (!pendientes.length) return aviso("No hay pendientes");
    const txt = `Hola. Estos participantes todavía no han respondido la encuesta final:\n${pendientes.map((f) => `• ${f.nombre}${f.celular ? ` — ${celularConIndicativo(f.celular, f.ciudad)}` : ""}`).join("\n")}`;
    try {
      await navigator.clipboard.writeText(txt);
      aviso(`Lista copiada (${pendientes.length}). Pégala en WhatsApp.`, true);
    } catch {
      if (navigator.share) await navigator.share({ text: txt }).catch(() => null);
      else aviso("No se pudo copiar. Intenta desde otro navegador.");
    }
  }

  async function agregarComentario() {
    if (!abierta || !texto.trim()) return;
    setGuardando(true);
    setErrorNota("");
    try {
      const res = await fetch(`/api/encuesta/${abierta.id}/comentarios`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje ?? "No se pudo guardar el comentario.");
      const nuevo = data.comentario as ComentarioVista;
      setFilas((fs) => (fs ?? []).map((f) => (f.id !== abierta.id ? f : conComentariosNuevos(f, [...f.comentarios, nuevo]))));
      setTexto("");
      aviso("Comentario guardado ✓", true);
    } catch (e) {
      setErrorNota(e instanceof Error ? e.message : "No se pudo guardar el comentario.");
    }
    setGuardando(false);
  }

  async function guardarEdicion() {
    if (!abierta || !edicion || !edicion.texto.trim()) return;
    setGuardando(true);
    setErrorEdicion("");
    try {
      const res = await fetch(`/api/encuesta/${abierta.id}/comentarios/${edicion.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: edicion.texto }) });
      if (res.status === 401) return window.location.assign("/login");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.mensaje ?? "No se pudo guardar el cambio.");
      const editado = data.comentario as ComentarioVista;
      setFilas((fs) => (fs ?? []).map((f) => (f.id !== abierta.id ? f : conComentariosNuevos(f, f.comentarios.map((c) => (c.id === editado.id ? editado : c))))));
      setEdicion(null);
      aviso("Comentario editado ✓", true);
    } catch (e) {
      setErrorEdicion(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    }
    setGuardando(false);
  }

  const filtros: [Filtro, string, number, string, string | null][] = [
    ["all", "Todos", total, "var(--ink)", null],
    ["respondio", "Respondieron", cnt.respondio, STY.respondio.dot, null],
    ["pendiente", "Faltan", cnt.pendiente, STY.pendiente.dot, null],
    ["comentarios", "Con comentarios", cnt.comentarios, "var(--yellow)", `de los ${cnt.pendiente} que faltan`],
  ];
  const em = q.trim() ? EMPTY.search : EMPTY[filtro];
  const kicker = ciudad || (verTodas ? "Todas las ciudades" : user.ciudades.join(" · "));

  return (
    <AppShell user={user} active="encuesta">
      <div className={m.head}>
        <div>
          <div className={m.kicker}>Encuesta final · {kicker}</div>
          <div className={m.total}>{filas ? `${cnt.respondio} de ${total} respondieron` : "Cargando…"}</div>
          {ciudades.length > 1 && (
            <select className={m.citySelect} value={ciudad} onChange={(e) => setCiudad(e.target.value)} aria-label="Ciudad">
              <option value="">{verTodas ? "Todas las ciudades" : "Todas mis ciudades"}</option>
              {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
        <div className={m.headActions}>
          <button type="button" className={m.copyBtn} onClick={copiarPendientes} disabled={!filas}>Copiar lista ({pendientes.length})</button>
        </div>
      </div>

      <div className={m.progress} aria-hidden>
        <i style={{ width: pct(cnt.respondio), background: "var(--green)" }} />
      </div>

      <div className={m.filters} role="tablist">
        {filtros.map(([k, label, count, dot, sub]) => (
          <button key={k} type="button" role="tab" aria-selected={filtro === k} className={`${m.filter} ${filtro === k ? m.filterOn : ""} ${k === "comentarios" ? t.filterSub : ""}`} onClick={() => setFiltro(k)}>
            <span className={m.filterLabel}><i className={m.dot} style={{ background: dot }} />{label}</span>
            <span className={m.filterCount}>{filas ? count : "–"}</span>
            {sub && filas && <span className={t.filterNote}>{sub}</span>}
          </button>
        ))}
      </div>

      <label className={m.search}>
        <span className={m.searchIcon} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, documento, correo o celular" aria-label="Buscar" />
      </label>
      {(nInactivos > 0 || mostrarInactivos) && (
        <div style={{ margin: "10px 0 4px" }}><FiltroInactivos valor={mostrarInactivos} onCambio={setMostrarInactivos} cuantos={nInactivos} /></div>
      )}

      <div className={t.tableHead}><span>Participante</span><span>Contacto</span><span>Estado</span><span>Respuesta</span><span /></div>

      <div className={m.list}>
        {loadErr && (
          <div className={m.empty}>
            <div className={m.emptyTitle}>No pudimos cargar la lista</div>
            <div className={m.emptyText}>Revisa tu conexión.</div>
            <button type="button" className={`${t.act} ${t.actGhost}`} onClick={() => cargar()} style={{ marginTop: 10 }}>Intentar de nuevo</button>
          </div>
        )}
        {!filas && !loadErr && <div className={m.skeleton} aria-label="Cargando">{Array.from({ length: 6 }, (_, i) => <i key={i} style={{ width: `${90 - (i % 3) * 15}%` }} />)}</div>}

        {visibles.map((f) => {
          const st = STY[f.estado];
          return (
            <div key={f.id} className={`${t.row} ${f.inactivo ? si.filaInactiva : ""}`}>
              <div className={t.rowGrid}>
                <div className={t.who}>
                  <i className={`${t.dot} ${t.mobileDot}`} style={{ background: st.dot }} />
                  <div className={t.whoText}>
                    <div className={t.name}>{f.nombre} <EtiquetaInactivo info={f.inactivo} /></div>
                    <div className={t.doc}>{f.documento} · {f.ciudad}{f.ciudadOriginal ? <span className={t.alias}> ({f.ciudadOriginal})</span> : null}</div>
                  </div>
                </div>
                <div className={t.contact}>
                  <span>{f.celular ? celularConIndicativo(f.celular, f.ciudad) : "(sin celular)"}</span>
                  <span>{f.correo || "(sin correo)"}</span>
                </div>
                <div className={t.state}>
                  <span className={t.badge} style={{ background: st.bg, color: st.fg }}><i className={t.dot} style={{ background: st.dot, width: 8, height: 8 }} />{st.label}</span>
                </div>
                <div className={t.envio}>
                  {f.respuesta ? <><b>{fecha(f.respuesta.fecha)}</b>{f.respuesta.total > 1 && <span className={t.envios2}> · {f.respuesta.total} respuestas</span>}<span className={t.por}>{POR[f.respuesta.por]}</span></>
                    : f.ultimoComentario !== null ? <>Último comentario: {fecha(new Date(f.ultimoComentario).toISOString())}{f.ultimoComentarioEditado ? " (editado)" : ""}</> : "—"}
                </div>
                <div className={t.acts}>
                  <button type="button" className={`${t.act} ${f.comentarios.length ? t.actComentarios : t.actGhost}`} onClick={() => { setDetalle(f.id); setTexto(""); setErrorNota(""); setEdicion(null); setErrorEdicion(""); }}>
                    Comentarios{f.comentarios.length ? ` (${f.comentarios.length})` : ""}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filas && !loadErr && visibles.length === 0 && (
          <div className={m.empty}>
            <div className={m.emptyIcon} style={{ background: "#F5F2EF", color: "var(--muted-2)" }}>{em[0]}</div>
            <div className={m.emptyTitle}>{em[1]}</div>
            <div className={m.emptyText}>{em[2]}</div>
          </div>
        )}
      </div>

      {abierta && (
        <div className={m.overlay} onClick={(e) => e.target === e.currentTarget && !guardando && setDetalle(null)}>
          <div className={m.modal} role="dialog" aria-modal="true" aria-labelledby="e-det">
            <div id="e-det" className={m.modalTitle}>{abierta.nombre}</div>
            <dl className={t.info}>
              <dt>Encuesta</dt><dd>
                <span className={t.badge} style={{ background: STY[abierta.estado].bg, color: STY[abierta.estado].fg }}>{STY[abierta.estado].label}</span>
                {abierta.estado === "pendiente" && abierta.conComentarios && <span className={t.tagComentarios}>Con comentarios</span>}
              </dd>
              {abierta.respuesta && <><dt>Respondió</dt><dd>{fecha(abierta.respuesta.fecha)} · {POR[abierta.respuesta.por]}{abierta.respuesta.total > 1 ? ` · ${abierta.respuesta.total} respuestas (cuenta la más reciente)` : ""}</dd></>}
              <dt>Documento</dt><dd>{abierta.documento}</dd>
              <dt>Ciudad</dt><dd>{abierta.ciudad}{abierta.ciudadOriginal ? ` (escrita como "${abierta.ciudadOriginal}")` : ""}</dd>
              <dt>Celular</dt><dd>{abierta.celular ? celularConIndicativo(abierta.celular, abierta.ciudad) : "—"}</dd>
              <dt>Correo</dt><dd>{abierta.correo || "—"}</dd>
            </dl>

            <div className={t.secTitle}>Comentarios {abierta.comentarios.length ? `(${abierta.comentarios.length})` : ""}</div>
            {abierta.comentarios.length === 0 ? <div className={t.vacio}>Sin comentarios todavía.</div> : (
              <ol className={t.notas}>
                {abierta.comentarios.map((c) => {
                  const propio = puedeComentar && c.autor.usuario === user.usuario;
                  const editando = edicion?.id === c.id;
                  return (
                    <li key={c.id} className={t.nota}>
                      <div className={t.notaHead}>
                        {c.autor.nombre} · {ROL_TXT[c.autor.rol as RolUsuario] ?? c.autor.rol}
                        <span>{fecha(c.fecha)}{c.editadoEn && <span className={t.editado}> · Editado · {fecha(c.editadoEn)}</span>}</span>
                      </div>
                      {editando ? (
                        <div className={t.form}>
                          <textarea className={t.textarea} value={edicion.texto} maxLength={1000} onChange={(e) => setEdicion({ id: c.id, texto: e.target.value })} aria-label="Editar comentario" autoFocus />
                          {errorEdicion && <div className="msg-error">{errorEdicion}</div>}
                          <div className={t.formRow}>
                            <span className={t.cuenta}>{edicion.texto.length}/1000</span>
                            <span className={t.editActs}>
                              <button type="button" className={`${t.act} ${t.actGhost}`} onClick={() => { setEdicion(null); setErrorEdicion(""); }} disabled={guardando}>Cancelar</button>
                              <button type="button" className={t.addBtn} onClick={guardarEdicion} disabled={guardando || !edicion.texto.trim() || edicion.texto.trim() === c.texto}>{guardando ? "Guardando…" : "Guardar"}</button>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={t.notaTexto}>{c.texto}</div>
                          {propio && !edicion && <button type="button" className={t.editarBtn} onClick={() => { setEdicion({ id: c.id, texto: c.texto }); setErrorEdicion(""); }}>Editar</button>}
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            {puedeComentar && !edicion && (
              <div className={t.form}>
                <textarea className={t.textarea} value={texto} maxLength={1000} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: Le escribí por WhatsApp, dijo que la responde hoy." aria-label="Nuevo comentario" />
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

      {toast && <div className={`${m.toast} ${toast.ok ? m.toastOk : ""}`} role="status">{toast.text}</div>}
    </AppShell>
  );
}
