"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/lib/auth";
import type { DatosEvento } from "@/lib/clausura/gestion";
import AppShell from "./AppShell";
import m from "./MonitorPanel.module.css";
import c from "./ClausuraEventos.module.css";

// Eventos de clausura por ciudad. Admin: crear, editar (con portada), abrir/cerrar y permitir editar después de enviar.
// Monitor (sus ciudades) y coordinación: solo lectura.

type Fila = {
  id: string; slug: string; tipo: "expoferia" | "clausura"; nombreTipo: string; titulo: string; nombreVisible: string; ciudades: string[];
  dia: string; hora: string; llegada: string | null; lugar: string; direccion: string; mapa: string; imagen: string | null; fechaLimite: string | null;
  estado: "borrador" | "abierto" | "cerrado"; permitirEdicion: boolean; proyecto: "obligatorio" | "opcional" | "no"; enviadas: number;
  datos?: DatosEvento;
};
type Datos = { eventos: Fila[]; ciudades: string[]; puedeGestionar: boolean };
type Form = DatosEvento & { copiarDe: string };

const ESTADOS = { borrador: ["Borrador", "var(--surface-2)", "var(--muted)"], abierto: ["Abierto", "var(--green-soft)", "var(--green-dark)"], cerrado: ["Cerrado", "var(--red-soft)", "var(--red-dark)"] } as const;
const PROYECTO = { obligatorio: "Obligatorio (todos presentan)", opcional: "Opcional (se pregunta si presenta)", no: "No hay proyecto" } as const;
const ZONAS = { "America/Bogota": "Colombia (UTC-5)", "America/Panama": "Panamá (UTC-5)", "America/Guayaquil": "Ecuador (UTC-5)", "America/Montevideo": "Uruguay (UTC-3)" };
const TIPOS = { expoferia: { nombre: "EXPOFeria y clausura", kicker: "EXPOFERIA" }, clausura: { nombre: "Clausura", kicker: "CLAUSURA" } } as const;

const slugDe = (t: string, anio: string) => `${t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${anio}`;

function nuevo(): Form {
  const anio = String(new Date().getFullYear());
  return {
    slug: "", tipo: "clausura", titulo: `Clausura ${anio}`, kicker: `CLAUSURA ${anio}`, nombreVisible: "", ciudades: [], descripcion: "",
    lugar: "", direccion: "", mapaUrl: null, zonaHoraria: "America/Bogota", inicio: "", fin: null, citacion: null, fechaLimite: null, imagen: null,
    permitirEdicion: false, proyecto: "no", copiarDe: "plantilla",
  };
}

/** Redimensiona (máx. 1600 px de ancho) y comprime en JPEG hasta ~550 KB, en el navegador. */
async function comprimir(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; });
    const escala = Math.min(1, 1600 / img.naturalWidth);
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(img.naturalWidth * escala), height: Math.round(img.naturalHeight * escala) });
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const calidad of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
      if (blob && blob.size <= 550 * 1024) return blob;
    }
    throw new Error("La imagen sigue pesando demasiado. Prueba con una más pequeña.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ClausuraEventos({ user }: { user: SessionUser }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<{ id: string | null; f: Form } | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok?: boolean } | null>(null);

  async function cargar() {
    try {
      const res = await fetch("/api/clausura/eventos", { cache: "no-store" });
      if (res.status === 401) return window.location.assign("/login");
      if (!res.ok) throw new Error();
      setDatos(await res.json());
      setError("");
    } catch {
      setError("No pudimos cargar los eventos. Revisa tu conexión.");
    }
  }
  useEffect(() => { cargar(); }, []);

  function aviso(text: string, ok = false) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3200);
  }

  async function patch(id: string, cuerpo: unknown, exito: string) {
    setGuardando(true);
    try {
      const res = await fetch(`/api/clausura/eventos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((d.errores as string[] | undefined)?.join(" · ") ?? "No se pudo guardar.");
      aviso(exito, true);
      await cargar();
      return true;
    } catch (e) {
      aviso(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function guardar() {
    if (!form) return;
    const f = form.f;
    const faltan: string[] = [];
    if (!f.nombreVisible.trim()) faltan.push("Escribe el nombre de la ciudad que verá el estudiante.");
    if (!f.ciudades.length) faltan.push("Elige al menos una ciudad de estudiantes.");
    if (!f.lugar.trim()) faltan.push("Escribe el lugar.");
    if (!f.direccion.trim()) faltan.push("Escribe la dirección.");
    if (!f.inicio) faltan.push("Elige la fecha y hora de inicio.");
    if (f.fin && f.inicio && f.fin <= f.inicio) faltan.push("La hora de fin debe ser después del inicio.");
    if (f.citacion && f.inicio && f.citacion > f.inicio) faltan.push("La hora de llegada debe ser antes o igual al inicio.");
    if (f.fechaLimite && f.inicio && f.fechaLimite > f.inicio) faltan.push("La fecha límite debe ser antes del evento.");
    setErrores(faltan);
    if (faltan.length) return;
    const { copiarDe, ...d } = f;
    const cuerpo = { ...d, slug: form.id ? d.slug : d.slug || slugDe(d.nombreVisible, d.inicio.slice(0, 4)), mapaUrl: d.mapaUrl?.trim() || null };
    if (form.id) {
      setGuardando(true);
      const res = await fetch(`/api/clausura/eventos/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "datos", datos: cuerpo }) });
      const r = await res.json().catch(() => ({}));
      setGuardando(false);
      if (!res.ok) return setErrores((r.errores as string[]) ?? ["No se pudo guardar."]);
    } else {
      setGuardando(true);
      const res = await fetch("/api/clausura/eventos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...cuerpo, copiarDe }) });
      const r = await res.json().catch(() => ({}));
      setGuardando(false);
      if (!res.ok) return setErrores((r.errores as string[]) ?? ["No se pudo crear."]);
    }
    setForm(null);
    aviso(form.id ? "Evento guardado ✓" : "Evento creado en borrador ✓", true);
    cargar();
  }

  async function subirPortada(archivo: File) {
    if (!form) return;
    setSubiendo(true);
    try {
      const blob = await comprimir(archivo);
      const res = await fetch("/api/clausura/imagenes", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.mensaje ?? "No se pudo subir la imagen.");
      setForm((x) => (x ? { ...x, f: { ...x.f, imagen: d.ruta } } : x));
    } catch (e) {
      aviso(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    }
    setSubiendo(false);
  }

  const gestionar = !!datos?.puedeGestionar;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((x) => (x ? { ...x, f: { ...x.f, [k]: v } } : x));

  return (
    <AppShell user={user} active="clausura_eventos">
      <div className={m.head}>
        <div>
          <div className={m.kicker}>Clausura · eventos</div>
          <div className={m.total}>{datos ? `${datos.eventos.length} ${datos.eventos.length === 1 ? "evento" : "eventos"}` : "Cargando…"}</div>
          {!gestionar && datos && <div className={c.lectura}>Solo lectura. Los eventos los crea y edita administración.</div>}
        </div>
        {gestionar && <button type="button" className={m.copyBtn} onClick={() => { setErrores([]); setForm({ id: null, f: nuevo() }); }}>+ Nuevo evento</button>}
      </div>

      {error && <div className={c.error}>{error}</div>}
      <div className={c.lista}>
        {datos?.eventos.map((e) => {
          const [txt, bg, fg] = ESTADOS[e.estado];
          return (
            <article key={e.id} className={c.evento}>
              {e.imagen
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={e.imagen} alt="" className={c.portada} />
                : <div className={`${c.portada} ${c.sinPortada}`}>Sin portada</div>}
              <div className={c.cuerpo}>
                <div className={c.etiquetas}>
                  <span className={c.chip} style={{ background: bg, color: fg }}>{txt}</span>
                  <span className={c.chip}>{e.nombreTipo}</span>
                  <span className={c.chip}>{e.ciudades.join(", ")}</span>
                </div>
                <h2 className={c.titulo}>{e.titulo} · {e.nombreVisible}</h2>
                <dl className={c.datos}>
                  <dt>Fecha</dt><dd>{e.dia} · {e.hora}</dd>
                  <dt>Llegada (citación)</dt><dd>{e.llegada ?? "Misma hora del inicio"}</dd>
                  <dt>Lugar</dt><dd>{e.lugar} · {e.direccion} · <a href={e.mapa} target="_blank" rel="noreferrer">mapa</a></dd>
                  <dt>Fecha límite</dt><dd>{e.fechaLimite ?? "Sin fecha límite"}</dd>
                  <dt>Editar después de enviar</dt><dd>{e.permitirEdicion ? "Sí, permitido" : "No (solo si administración reabre)"}</dd>
                  <dt>Proyecto</dt><dd>{PROYECTO[e.proyecto]}</dd>
                  <dt>Respuestas enviadas</dt><dd>{e.enviadas}</dd>
                  <dt>Enlace</dt><dd><a href={`/clausura/${e.slug}`} target="_blank" rel="noreferrer">/clausura/{e.slug}</a></dd>
                </dl>
                <div className={c.acciones}>
                  <a className={c.btn} href={`/clausura/panel?evento=${e.id}`}>Ver respuestas</a>
                  {gestionar && e.datos && (
                    <>
                      <button type="button" className={c.btn} onClick={() => { setErrores([]); setForm({ id: e.id, f: { ...e.datos!, copiarDe: "" } }); }}>Editar</button>
                      {e.estado !== "abierto"
                        ? <button type="button" className={`${c.btn} ${c.btnVerde}`} disabled={guardando} onClick={() => window.confirm(`¿Abrir "${e.titulo} · ${e.nombreVisible}"? Los estudiantes podrán responder.`) && patch(e.id, { accion: "estado", estado: "abierto" }, "Evento abierto ✓")}>Abrir</button>
                        : <button type="button" className={`${c.btn} ${c.btnRojo}`} disabled={guardando} onClick={() => window.confirm(`¿Cerrar "${e.titulo} · ${e.nombreVisible}"? Ya no se aceptarán respuestas.`) && patch(e.id, { accion: "estado", estado: "cerrado" }, "Evento cerrado ✓")}>Cerrar</button>}
                      <button type="button" className={c.btn} disabled={guardando} onClick={() => patch(e.id, { accion: "edicion", permitir: !e.permitirEdicion }, e.permitirEdicion ? "Edición después de enviar desactivada ✓" : "Edición después de enviar activada ✓")}>
                        {e.permitirEdicion ? "Bloquear edición" : "Permitir edición"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {datos && datos.eventos.length === 0 && <div className={c.vacio}>Todavía no hay eventos{gestionar ? ". Crea el primero con “Nuevo evento”." : " para tu ciudad."}</div>}
      </div>

      {form && (
        <div className={m.overlay} onClick={(e) => e.target === e.currentTarget && !guardando && setForm(null)}>
          <div className={`${m.modal} ${c.modal}`} role="dialog" aria-modal="true" aria-labelledby="ev-t">
            <div id="ev-t" className={m.modalTitle}>{form.id ? "Editar evento" : "Nuevo evento"}</div>
            <div className={c.grid}>
              <label className={c.campo}>Tipo
                <select className="input" value={form.f.tipo} onChange={(e) => {
                  const tipo = e.target.value as Form["tipo"]; const anio = (form.f.inicio || String(new Date().getFullYear())).slice(0, 4);
                  setForm({ ...form, f: { ...form.f, tipo, titulo: `${TIPOS[tipo].nombre} ${anio}`, kicker: `${TIPOS[tipo].kicker} ${anio}`, proyecto: tipo === "clausura" ? "no" : form.f.proyecto } });
                }}>
                  <option value="expoferia">EXPOFeria y clausura (con proyectos)</option>
                  <option value="clausura">Clausura (solo ceremonia)</option>
                </select>
              </label>
              <label className={c.campo}>Proyecto
                <select className="input" value={form.f.proyecto} onChange={(e) => set("proyecto", e.target.value as Form["proyecto"])}>
                  {Object.entries(PROYECTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className={c.campo}>Título<input className="input" value={form.f.titulo} maxLength={120} onChange={(e) => set("titulo", e.target.value)} /></label>
              <label className={c.campo}>Texto pequeño (kicker)<input className="input" value={form.f.kicker} maxLength={40} onChange={(e) => set("kicker", e.target.value)} /></label>
              <label className={c.campo}>Ciudad que ve el estudiante<input className="input" value={form.f.nombreVisible} maxLength={60} onChange={(e) => set("nombreVisible", e.target.value)} placeholder="Ej.: Paysandú" /></label>
              <label className={c.campo}>Dirección web
                <input className="input" value={form.id ? form.f.slug : form.f.slug || (form.f.nombreVisible && form.f.inicio ? slugDe(form.f.nombreVisible, form.f.inicio.slice(0, 4)) : "")} disabled={!!form.id}
                  onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="se arma sola: cali-2026" />
                <span className={c.ayuda}>/clausura/{form.f.slug || "…"}{form.id ? " (no se puede cambiar)" : ""}</span>
              </label>
              <fieldset className={`${c.campo} ${c.ancho}`}>
                <legend>Ciudades de estudiantes que cubre</legend>
                <div className={c.ciudades}>
                  {datos!.ciudades.map((x) => (
                    <label key={x} className={c.check}><input type="checkbox" checked={form.f.ciudades.includes(x)} onChange={(e) => set("ciudades", e.target.checked ? [...form.f.ciudades, x] : form.f.ciudades.filter((y) => y !== x))} />{x}</label>
                  ))}
                </div>
              </fieldset>
              <label className={c.campo}>Lugar<input className="input" value={form.f.lugar} maxLength={150} onChange={(e) => set("lugar", e.target.value)} /></label>
              <label className={c.campo}>Dirección<input className="input" value={form.f.direccion} maxLength={200} onChange={(e) => set("direccion", e.target.value)} /></label>
              <label className={`${c.campo} ${c.ancho}`}>Enlace al mapa (opcional)<input className="input" value={form.f.mapaUrl ?? ""} onChange={(e) => set("mapaUrl", e.target.value)} placeholder="Si lo dejas vacío, se arma con el lugar y la dirección" /></label>
              <label className={c.campo}>Zona horaria
                <select className="input" value={form.f.zonaHoraria} onChange={(e) => set("zonaHoraria", e.target.value)}>
                  {Object.entries(ZONAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className={c.campo}>Inicio<input type="datetime-local" className="input" value={form.f.inicio} onChange={(e) => set("inicio", e.target.value)} /></label>
              <label className={c.campo}>Hora de llegada (citación)<input type="datetime-local" className="input" value={form.f.citacion ?? ""} onChange={(e) => set("citacion", e.target.value || null)} /><span className={c.ayuda}>Ej.: 8:30 si el evento empieza a las 9:00. Es la hora del calendario.</span></label>
              <label className={c.campo}>Fin<input type="datetime-local" className="input" value={form.f.fin ?? ""} onChange={(e) => set("fin", e.target.value || null)} /></label>
              <label className={c.campo}>Fecha límite para responder<input type="datetime-local" className="input" value={form.f.fechaLimite ?? ""} onChange={(e) => set("fechaLimite", e.target.value || null)} /><span className={c.ayuda}>Vacía = sin fecha límite</span></label>
              <label className={`${c.campo} ${c.ancho}`}>Descripción (opcional)<textarea className={`input ${c.textarea}`} value={form.f.descripcion} maxLength={5000} onChange={(e) => set("descripcion", e.target.value)} placeholder="**negrita**, *cursiva*, listas con - " /></label>
              <div className={`${c.campo} ${c.ancho}`}>Portada
                <div className={c.portadaFila}>
                  {form.f.imagen
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={form.f.imagen} alt="Portada" className={c.portadaMini} />
                    : <div className={`${c.portadaMini} ${c.sinPortada}`}>Sin portada</div>}
                  <label className={c.btn}>{subiendo ? "Subiendo…" : form.f.imagen ? "Cambiar imagen" : "Subir imagen"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={subiendo} onChange={(e) => { const a = e.target.files?.[0]; if (a) subirPortada(a); e.target.value = ""; }} />
                  </label>
                  {form.f.imagen && <button type="button" className={c.btn} onClick={() => set("imagen", null)}>Quitar</button>}
                </div>
                <span className={c.ayuda}>Se ajusta sola a 1600 px y se comprime (JPG, PNG o WebP).</span>
              </div>
              <label className={`${c.check} ${c.ancho}`}><input type="checkbox" checked={form.f.permitirEdicion} onChange={(e) => set("permitirEdicion", e.target.checked)} />Permitir que editen después de enviar</label>
              {!form.id && (
                <label className={`${c.campo} ${c.ancho}`}>Copiar las preguntas de
                  <select className="input" value={form.f.copiarDe} onChange={(e) => set("copiarDe", e.target.value)}>
                    <option value="plantilla">Formulario estándar (el de Cali y Cartagena)</option>
                    {datos!.eventos.map((e) => <option key={e.id} value={e.id}>{e.titulo} · {e.nombreVisible}</option>)}
                  </select>
                </label>
              )}
            </div>
            {errores.length > 0 && <ul className={c.errores}>{errores.map((x) => <li key={x}>{x}</li>)}</ul>}
            {!form.id && <div className={c.ayuda}>El evento se crea en borrador: los estudiantes no lo ven hasta que lo abras.</div>}
            <div className={m.modalActions}>
              <button type="button" className={m.cancel} onClick={() => setForm(null)} disabled={guardando}>Cancelar</button>
              <button type="button" className="btn btn-primary" onClick={guardar} disabled={guardando || subiendo}>{guardando ? "Guardando…" : form.id ? "Guardar cambios" : "Crear evento"}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`${m.toast} ${toast.ok ? m.toastOk : ""}`} role="status">{toast.text}</div>}
    </AppShell>
  );
}
