"use client";

import { useEffect, useMemo, useState } from "react";
import type { VistaEstudiante } from "@/lib/clausura/estudiante";
import type { EventoVista } from "@/lib/clausura/evento";
import { claveOtro, esPregunta, type Item, type Pregunta, type Respuestas, type Valor } from "@/lib/clausura/formulario/esquema";
import { respuestasLegibles } from "@/lib/clausura/formulario/mostrar";
import { camino, validarRespuestas } from "@/lib/clausura/formulario/motor";
import { GENEROS, validarTelefono, type Genero } from "@/lib/clausura/contacto";
import { paisDeCiudad } from "@/lib/testimonios/celular";
import { checkEmail, domainOf, emailError } from "@/lib/validation/email";
import ClausuraTexto from "./ClausuraTexto";
import s from "./StudentFlow.module.css";
import c from "./Clausura.module.css"; // después de StudentFlow: sus reglas ganan

// Portal de clausura del estudiante: portada del evento → documento → contacto → secciones → resumen → éxito.
// Todo lo importante lo decide el servidor (camino, validación, ciudad); aquí solo se usa el motor para la experiencia.

type Pantalla = "portada" | "cargando" | "contacto" | "seccion" | "resumen" | "exito" | "ver" | "pronto" | "noEncontrado" | "cerrado";
export type EventoLista = { slug: string; nombreVisible: string; dia: string };

const RED_NET = "No pudimos conectarnos. Revisa tu internet e intenta otra vez.";
const SESION = "Pasó mucho tiempo sin actividad. Escribe tu documento otra vez para seguir donde ibas.";

function Icono({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}
const I_CAL = "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z";
const I_HORA = "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z";
const I_LUGAR = "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z";
const I_ATRAS = "M15 5l-7 7 7 7";

function EventoInfo({ ev, conDescripcion = true }: { ev: EventoVista; conDescripcion?: boolean }) {
  return (
    <div className={c.evInfo}>
      {ev.imagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ev.imagen} alt="" className={c.evImg} />
      )}
      <div className={c.evRows}>
        <div className={c.evRow}><span className={c.evIcon}><Icono d={I_CAL} /></span><span><b>{ev.dia}</b></span></div>
        <div className={c.evRow}><span className={c.evIcon}><Icono d={I_HORA} /></span><span>{ev.llegada ? <><b>Llegada: {ev.llegada}</b><br />Evento: {ev.hora}</> : ev.hora}</span></div>
        <div className={c.evRow}><span className={c.evIcon}><Icono d={I_LUGAR} /></span>
          <span><b>{ev.lugar}</b><br />{ev.direccion} · <a href={ev.mapa} target="_blank" rel="noreferrer">Ver en el mapa</a></span>
        </div>
      </div>
      {conDescripcion && ev.descripcion && <ClausuraTexto texto={ev.descripcion} className={c.rico} />}
    </div>
  );
}

/** "Agregar a mi calendario" (.ics, sirve en el celular y en Outlook) y "Agregar a Google Calendar". */
function Calendario({ ev }: { ev: EventoVista }) {
  return (
    <div className={c.calendario}>
      <a className="btn btn-primary" href={ev.calendario.ics} download={`${ev.slug}.ics`}>
        <Icono d={I_CAL} />Agregar a mi calendario
      </a>
      <a className={c.google} href={ev.calendario.google} target="_blank" rel="noreferrer">Agregar a Google Calendar</a>
    </div>
  );
}

function Opcion({ on, redonda, error, onClick, children }: { on: boolean; redonda?: boolean; error?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role={redonda ? "radio" : "checkbox"} aria-checked={on} onClick={onClick} className={`check ${on ? "is-on" : ""} ${error ? "is-error" : ""}`}>
      <span className={`check-box ${redonda ? c.radio : ""}`}>{on ? (redonda ? "" : "✓") : ""}</span>
      <span>{children}</span>
    </button>
  );
}

type PropsCampo = {
  p: Pregunta; valor: Valor | undefined; error?: string; onChange: (v: Valor | undefined) => void;
  /** "Otro: ¿cuál?": texto y error de esa opción. */
  otro: string; errorOtro?: string; onOtro: (t: string) => void;
};

function CampoPregunta({ p, valor, error, onChange, otro, errorOtro, onOtro }: PropsCampo) {
  const id = `q-${p.id}`;
  const opciones = (p.opciones ?? []).filter((o) => !o.archivada || (Array.isArray(valor) ? valor.includes(o.id) : valor === o.id));
  const txt = typeof valor === "string" || typeof valor === "number" ? String(valor) : "";
  const conOtro = !!p.opciones?.some((o) => o.otro && o.id === valor);
  let campo: React.ReactNode;
  switch (p.tipo) {
    case "texto":
      campo = p.formato === "url"
        ? <input id={id} type="url" inputMode="url" autoComplete="off" placeholder="https://…" className={`input ${error ? "is-error" : ""}`} value={txt} maxLength={300} onChange={(e) => onChange(e.target.value)} />
        : p.formato === "documento"
          ? <input id={id} inputMode="text" autoComplete="off" autoCapitalize="characters" placeholder="Sin puntos ni espacios" className={`input ${error ? "is-error" : ""}`} value={txt} maxLength={30} onChange={(e) => onChange(e.target.value)} />
          : <input id={id} className={`input ${error ? "is-error" : ""}`} value={txt} maxLength={300} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "parrafo": campo = <textarea id={id} className={`input ${c.textarea} ${error ? "is-error" : ""}`} value={txt} maxLength={3000} onChange={(e) => onChange(e.target.value)} />; break;
    case "numero": campo = <input id={id} className={`input ${c.corto} ${error ? "is-error" : ""}`} inputMode={p.entero ? "numeric" : "decimal"} value={txt} onChange={(e) => onChange(e.target.value.replace(/[^\d.,-]/g, ""))} />; break;
    case "fecha": campo = <input id={id} type="date" className={`input ${c.corto} ${error ? "is-error" : ""}`} value={txt} onChange={(e) => onChange(e.target.value)} />; break;
    case "telefono": campo = <input id={id} type="tel" inputMode="tel" autoComplete="off" className={`input ${error ? "is-error" : ""}`} value={txt} maxLength={30} onChange={(e) => onChange(e.target.value)} />; break;
    case "desplegable":
      campo = (
        <select id={id} className={`input ${c.select} ${error ? "is-error" : ""}`} value={txt} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">Elige una opción</option>
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
        </select>
      );
      break;
    case "sino":
      campo = (
        <div className={c.sino} role="radiogroup" aria-labelledby={`${id}-t`}>
          {(["si", "no"] as const).map((v) => <Opcion key={v} redonda on={valor === v} error={!!error} onClick={() => onChange(v)}>{v === "si" ? "Sí" : "No"}</Opcion>)}
        </div>
      );
      break;
    case "unica":
      campo = (
        <div className={c.opciones} role="radiogroup" aria-labelledby={`${id}-t`}>
          {opciones.map((o) => <Opcion key={o.id} redonda on={valor === o.id} error={!!error} onClick={() => onChange(o.id)}>{o.texto}</Opcion>)}
        </div>
      );
      break;
    case "casillas": {
      const marcadas = Array.isArray(valor) ? valor : [];
      campo = (
        <div className={c.opciones} role="group" aria-labelledby={`${id}-t`}>
          {opciones.map((o) => {
            const on = marcadas.includes(o.id);
            return <Opcion key={o.id} on={on} error={!!error} onClick={() => onChange(on ? marcadas.filter((x) => x !== o.id) : [...marcadas, o.id])}>{o.texto}</Opcion>;
          })}
        </div>
      );
      break;
    }
  }
  return (
    <div className={c.pregunta}>
      <label className="label" id={`${id}-t`} htmlFor={["unica", "casillas", "sino"].includes(p.tipo) ? undefined : id}>
        {p.titulo}{p.obligatoria && <span className={c.obligatoria} aria-label="obligatoria"> *</span>}
      </label>
      {p.ayuda && <div className={c.ayuda}>{p.ayuda}</div>}
      {campo}
      {error && <div className="msg-error">{error}</div>}
      {conOtro && (
        <div className={c.otro}>
          <label className="label" htmlFor={`${id}-otro`}>¿Cuál?<span className={c.obligatoria} aria-label="obligatoria"> *</span></label>
          <input id={`${id}-otro`} className={`input ${errorOtro ? "is-error" : ""}`} value={otro} maxLength={200} onChange={(e) => onOtro(e.target.value)} />
          {errorOtro && <div className="msg-error">{errorOtro}</div>}
        </div>
      )}
    </div>
  );
}

function Bloque({ item }: { item: Extract<Item, { tipo: "info" }> }) {
  return (
    <div className={c.bloque}>
      {item.titulo && <div className={c.bloqueTitulo}>{item.titulo}</div>}
      {item.texto && <ClausuraTexto texto={item.texto} className={c.rico} />}
      {item.imagen && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imagen} alt="" className={c.bloqueImg} />
      )}
    </div>
  );
}

type FormContacto = {
  correo: "si" | "no" | null; correoNuevo: string;
  celularModo: "prellenado" | "guardado" | "nuevo"; celularNuevo: string;
  whatsapp: "mismo" | "otro" | "no" | null; whatsappNumero: string;
  genero: Genero | null;
};

/** Mensaje claro para un celular que no sirve, con la longitud del país de su ciudad. */
function mensajeCelular(ciudad: string): string {
  const p = paisDeCiudad(ciudad);
  return p ? `Escribe un celular válido de ${p.nacional} dígitos (sin el indicativo +${p.cc}).` : "Escribe un número de celular válido.";
}

function contactoInicial(v: VistaEstudiante): FormContacto {
  const k = v.respuesta.contacto;
  return {
    correo: k ? (k.correoConfirmado ? "si" : "no") : null, correoNuevo: "",
    celularModo: k ? "guardado" : v.estudiante.celularOculto ? "prellenado" : "nuevo", celularNuevo: "",
    whatsapp: k ? (!k.tieneWhatsApp ? "no" : k.whatsappOculto ? "otro" : "mismo") : null, whatsappNumero: "",
    genero: (k?.genero as Genero | null) ?? null,
  };
}

export default function ClausuraFlujo({ evento, eventos = [], privacyUrl }: { evento: EventoVista | null; eventos?: EventoLista[]; privacyUrl: string }) {
  const [pantalla, setPantalla] = useState<Pantalla>("portada");
  const [cargandoTxt, setCargandoTxt] = useState("");
  const [vista, setVista] = useState<VistaEstudiante | null>(null);
  const [doc, setDoc] = useState("");
  const [docErr, setDocErr] = useState("");
  const [resp, setResp] = useState<Respuestas>({});
  const [seccionId, setSeccionId] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGeneral, setErrorGeneral] = useState("");
  const [fc, setFc] = useState<FormContacto | null>(null);
  const [enviando, setEnviando] = useState(false);

  const ev = vista?.evento ?? evento;
  const form = ev?.formulario ?? null;
  const ruta = useMemo(() => (form ? camino(form, resp) : null), [form, resp]);
  const ids = useMemo(() => ruta?.pasos.map((p) => p.seccion.id) ?? [], [ruta]);

  function ir(p: Pantalla, sec = "") {
    setErrores({});
    setErrorGeneral("");
    setSeccionId(sec);
    setPantalla(p);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Aplica lo que devolvió el servidor y decide a dónde ir. */
  function aplicar(v: VistaEstudiante, siguiente?: string) {
    setVista(v);
    setResp(v.respuesta.respuestas);
    setFc(contactoInicial(v));
    if (window.location.pathname !== `/clausura/${v.evento.slug}`) window.history.replaceState(null, "", `/clausura/${v.evento.slug}`);
    document.title = `${v.evento.titulo} · ${v.evento.nombreVisible}`;
    const r = v.respuesta;
    if (r.estado === "enviada" && !r.editando) return ir("ver");
    if (!v.puedeResponder) return ir("cerrado");
    const destino = siguiente ?? r.seccionActual;
    if (!r.contacto || destino === "contacto") return ir("contacto");
    const secciones = camino(v.evento.formulario, r.respuestas).pasos.map((p) => p.seccion.id);
    if (destino !== "resumen" && secciones.includes(destino)) return ir("seccion", destino);
    return ir("resumen");
  }

  async function api(ruta: string, metodo: "GET" | "POST" | "PUT", cuerpo?: unknown): Promise<{ status: number; data: Record<string, unknown> } | null> {
    try {
      const res = await fetch(`/api/clausura/estudiante/${ruta}`, {
        method: metodo, cache: "no-store", headers: cuerpo === undefined ? undefined : { "Content-Type": "application/json" },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && ruta !== "estado") {
        setVista(null);
        setDocErr(SESION);
        ir("portada");
        return null;
      }
      return { status: res.status, data };
    } catch {
      setErrorGeneral(RED_NET);
      return null;
    }
  }

  // Si ya había entrado hace poco (cookie vigente), sigue donde iba sin volver a escribir el documento.
  useEffect(() => {
    let vivo = true;
    fetch("/api/clausura/estudiante/estado", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (vivo && v?.resultado === "ok") aplicar(v as VistaEstudiante); })
      .catch(() => null);
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ingresar() {
    const d = doc.replace(/[^0-9a-zA-Z]/g, "");
    if (!d) return setDocErr("Escribe tu número de documento");
    if (d.length < 3) return setDocErr("Revisa el número: parece incompleto");
    setCargandoTxt("Buscando tu información…");
    setPantalla("cargando");
    const r = await api("ingresar", "POST", { documento: d });
    if (!r) { setPantalla("portada"); return setDocErr(RED_NET); }
    if (r.status === 404) return ir("noEncontrado");
    if (r.status === 429) { setPantalla("portada"); return setDocErr(String(r.data.mensaje ?? "Demasiados intentos. Espera unos minutos.")); }
    if (r.status !== 200) { setPantalla("portada"); return setDocErr("Algo salió mal. Intenta otra vez."); }
    if (r.data.resultado === "pronto") return ir("pronto");
    setDocErr("");
    aplicar(r.data as unknown as VistaEstudiante);
  }

  async function salir() {
    await fetch("/api/clausura/estudiante/salir", { method: "POST" }).catch(() => null);
    setVista(null);
    setDoc("");
    setResp({});
    if (evento) window.history.replaceState(null, "", `/clausura/${evento.slug}`);
    ir("portada");
  }

  // ----- Contacto -----
  async function guardarContacto() {
    if (!fc || !vista) return;
    const e: Record<string, string> = {};
    if (!fc.correo) e.correo = "Cuéntanos si sigue siendo tu correo.";
    const chk = checkEmail(fc.correoNuevo);
    const yaTieneNuevo = !!vista.respuesta.contacto?.correoNuevoOculto;
    if (fc.correo === "no" && (fc.correoNuevo.trim() || !yaTieneNuevo)) {
      const err = fc.correoNuevo.trim() ? emailError(chk) : "Escribe tu correo.";
      if (err) e.correoNuevo = err;
    }
    const ciudad = vista.estudiante.ciudad;
    if (fc.celularModo === "nuevo") {
      if (!fc.celularNuevo.trim()) e.celular = "Escribe tu número de celular.";
      else if (!validarTelefono(fc.celularNuevo, ciudad).ok) e.celular = mensajeCelular(ciudad);
    }
    if (fc.whatsapp === "otro" && fc.whatsappNumero.trim() && !validarTelefono(fc.whatsappNumero, ciudad).ok) e.whatsappNumero = mensajeCelular(ciudad);
    if (!fc.genero) e.genero = "Elige una opción.";
    if (!fc.whatsapp) e.whatsapp = "Cuéntanos si tienes WhatsApp.";
    if (fc.whatsapp === "otro" && !fc.whatsappNumero.trim() && !vista.respuesta.contacto?.whatsappOculto) e.whatsappNumero = "Escribe tu número de WhatsApp.";
    setErrores(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    const r = await api("contacto", "PUT", {
      correoConfirmado: fc.correo === "si",
      ...(fc.correo === "no" && fc.correoNuevo.trim() ? { correoNuevo: fc.correoNuevo.trim() } : {}),
      celular: fc.celularModo === "nuevo" ? { nuevo: fc.celularNuevo } : { usar: fc.celularModo },
      whatsapp: fc.whatsapp,
      genero: fc.genero,
      ...(fc.whatsapp === "otro" && fc.whatsappNumero.trim() ? { whatsappNumero: fc.whatsappNumero } : {}),
    });
    setEnviando(false);
    if (!r) return;
    if (r.status === 400 && r.data.errores) return setErrores(r.data.errores as Record<string, string>);
    if (r.status !== 200) return setErrorGeneral(r.data.error === "cerrado" ? "Este evento ya no recibe respuestas." : "No pudimos guardar. Intenta otra vez.");
    aplicar(r.data as unknown as VistaEstudiante, String(r.data.siguiente ?? ""));
  }

  // ----- Secciones -----
  const paso = ruta?.pasos.find((p) => p.seccion.id === seccionId) ?? null;

  async function siguiente() {
    if (!form || !paso) return;
    const v = validarRespuestas(form, resp, paso.seccion.id);
    if (!v.ok) {
      setErrores(v.errores);
      return document.getElementById(`q-${Object.keys(v.errores)[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const claves = paso.items.filter(esPregunta).flatMap((q) => [q.id, claveOtro(q.id)]);
    const valores = Object.fromEntries(claves.filter((k) => v.respuestas[k] !== undefined).map((k) => [k, v.respuestas[k]]));
    setEnviando(true);
    const r = await api("seccion", "PUT", { seccion: paso.seccion.id, respuestas: valores });
    setEnviando(false);
    if (!r) return;
    if (r.status === 400 && r.data.errores) return setErrores(r.data.errores as Record<string, string>);
    if (r.status !== 200) return setErrorGeneral(r.data.error === "cerrado" ? "Este evento ya no recibe respuestas." : "No pudimos guardar. Intenta otra vez.");
    aplicar(r.data as unknown as VistaEstudiante, String(r.data.siguiente ?? "resumen"));
  }

  function atras() {
    if (pantalla === "seccion") {
      const k = ids.indexOf(seccionId);
      return k > 0 ? ir("seccion", ids[k - 1]) : ir("contacto");
    }
    if (pantalla === "resumen") return ids.length ? ir("seccion", ids[ids.length - 1]) : ir("contacto");
    if (pantalla === "noEncontrado") return ir("portada");
  }

  async function enviar() {
    setEnviando(true);
    const r = await api("enviar", "POST");
    setEnviando(false);
    if (!r) return;
    if (r.status === 400 && r.data.seccion) {
      ir("seccion", String(r.data.seccion));
      return setErrores((r.data.errores ?? {}) as Record<string, string>);
    }
    if (r.status !== 200) return setErrorGeneral(r.data.error === "cerrado" ? "Este evento ya no recibe respuestas." : "No pudimos enviar. Intenta otra vez.");
    const v = r.data as unknown as VistaEstudiante;
    setVista(v);
    setResp(v.respuesta.respuestas);
    ir("exito");
  }

  async function edicion(accion: "empezar" | "cancelar") {
    setEnviando(true);
    const r = await api("edicion", "POST", { accion });
    setEnviando(false);
    if (!r) return;
    if (r.status !== 200) return setErrorGeneral("No pudimos abrir la edición. Intenta otra vez.");
    const v = r.data as unknown as VistaEstudiante;
    aplicar(v, accion === "empezar" ? "resumen" : undefined);
  }

  // ----- Textos de la columna izquierda -----
  const nombre = (vista?.estudiante.nombre ?? "").split(" ")[0];
  const editando = !!vista?.respuesta.editando;
  const textos: Record<Pantalla, [string, string, string, string?]> = {
    portada: ev ? [ev.kicker, ev.titulo, ev.nombreVisible] : [eventos.length ? "Clausura 2026" : "Clausura", "Confirma tu asistencia a la clausura", "Escribe tu documento y te mostramos el evento de tu ciudad."],
    cargando: ev ? [ev.kicker, ev.titulo, ev.nombreVisible] : ["Clausura", "Un momento…", ""],
    contacto: ["Tus datos de contacto", `Hola, ${nombre}.`, "Antes de empezar, confirma cómo podemos escribirte."],
    seccion: [ev?.kicker ?? "", paso?.seccion.titulo ?? "", ""],
    resumen: [editando ? "Editando tus respuestas" : "Último paso", "Revisa tus respuestas", editando ? "Tus cambios se guardan cuando pulses Enviar." : "Si algo no está bien, toca Editar en esa parte. Cuando esté todo, pulsa Enviar."],
    exito: vista?.asistira
      ? ["Todo listo", `¡Listo, ${nombre}! Te esperamos en la ${ev?.fraseTipo ?? "clausura"}`, "Guardamos tus respuestas. Agrega el evento a tu calendario para no olvidarlo."]
      : ["Todo listo", `¡Gracias, ${nombre}! Recibimos tus respuestas`, "Ya puedes cerrar esta página."],
    ver: ["Ya respondiste", "Estas son tus respuestas", vista?.respuesta.reabierta && vista.puedeResponder
      ? "Tu respuesta fue reabierta: puedes cambiarla, pero debes volver a enviarla."
      : vista?.puedeResponder ? `Puedes editarlas mientras el evento siga abierto${ev?.fechaLimite ? ` (hasta el ${ev.fechaLimite})` : ""}.` : "Ya no se pueden cambiar. Si necesitas un cambio, escríbele a tu monitor."],
    pronto: ["Muy pronto", "Pronto publicaremos la información de tu ciudad", "Vuelve a entrar en unos días. Si tienes dudas, escríbele a tu monitor."],
    noEncontrado: ["Algo no cuadra", "Tu documento no aparece", "Revisa que el número esté bien escrito. Si sigue sin aparecer, escríbele a tu monitor."],
    cerrado: ["Confirmaciones cerradas", "Este evento ya cerró sus confirmaciones", "Si tienes dudas, escríbele a tu monitor."],
  };
  const [kicker, titulo, sub] = textos[pantalla];
  const colorKicker = pantalla === "exito" || pantalla === "ver" ? "var(--green-dark)" : pantalla === "noEncontrado" || pantalla === "cerrado" ? "var(--red-ink)" : "var(--orange-dark)";
  const pasos = ["contacto", ...ids];
  const progreso = pantalla === "contacto" ? 1 : pantalla === "seccion" ? ids.indexOf(seccionId) + 2 : pantalla === "resumen" ? pasos.length + 1 : 0;
  const totalPasos = pasos.length + 1;
  const puedeAtras = (pantalla === "seccion" || pantalla === "resumen" || pantalla === "noEncontrado") && !enviando;
  const legibles = vista && form ? respuestasLegibles(form, resp) : [];
  const k = vista?.respuesta.contacto;

  return (
    <div className={s.shell}>
      <i className={`${s.deco} ${s.decoRing}`} aria-hidden />
      <i className={`${s.deco} ${s.decoSun}`} aria-hidden />
      <i className={`${s.deco} ${s.decoSquare}`} aria-hidden />
      <i className={`${s.deco} ${s.decoBlob}`} aria-hidden />

      <header className={s.header}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-jc.png" alt="Jóvenes creaTIvos" className={s.logo} />
        <div className={s.headerRight}>
          <span>Fundación ROFÉ</span>
          <span className={s.divider} />
          <span>¿Problemas? Escríbele a tu monitor</span>
        </div>
        {vista && <button type="button" className={c.salir} onClick={salir}>No soy {nombre}</button>}
      </header>

      <main className={`${s.main} ${pantalla === "portada" ? c.mainPortada : ""}`}>
        <section className={s.intro}>
          {puedeAtras && (
            <button type="button" className={s.back} onClick={atras}><Icono d={I_ATRAS} />Atrás</button>
          )}
          {progreso > 0 && (
            <div className={`${s.progress} ${c.progreso}`}>
              <div className={s.bars}>{Array.from({ length: totalPasos }, (_, i) => <div key={i} className={`${s.bar} ${i < progreso ? s.barOn : ""}`} />)}</div>
              <span className={s.stepLabel}>Paso {progreso} de {totalPasos}</span>
            </div>
          )}
          <div className={`kicker ${s.kicker}`} style={{ color: colorKicker }}>{kicker}</div>
          <h1 className={s.title}>{titulo}</h1>
          {pantalla === "seccion" && paso?.seccion.descripcion ? <ClausuraTexto texto={paso.seccion.descripcion} className={`${s.sub} ${c.rico}`} /> : sub ? <p className={s.sub}>{sub}</p> : null}
          {(pantalla === "portada" || pantalla === "cargando") && ev && <EventoInfo ev={ev} />}
          {pantalla === "portada" && !ev && eventos.length > 0 && (
            <div className={c.ciudades}>
              <div className={s.smallLabel}>Eventos publicados</div>
              {eventos.map((e) => <a key={e.slug} href={`/clausura/${e.slug}`} className={c.ciudad}><b>{e.nombreVisible}</b><span>{e.dia}</span></a>)}
            </div>
          )}
        </section>

        <section className={s.card} aria-live="polite">
          {pantalla === "portada" && (
            <form className={s.form} onSubmit={(e) => { e.preventDefault(); ingresar(); }}>
              {ev && !ev.aceptaRespuestas && <div className="note note-info" style={{ marginBottom: 16 }}><span>Este evento ya cerró sus confirmaciones. Si ya respondiste, entra para ver tus respuestas.</span></div>}
              <label className="label" htmlFor="doc">Número de documento</label>
              <input id="doc" className={`input ${s.docInput} ${docErr ? "is-error" : ""}`} value={doc}
                onChange={(e) => { setDoc(e.target.value); setDocErr(""); }} inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni espacios" />
              {docErr && <div className="msg-error">{docErr}</div>}
              <div className={s.grow} />
              <button type="submit" className="btn btn-primary" style={{ marginTop: 22 }}>{ev?.aceptaRespuestas === false ? "Ver mis respuestas" : "Entrar"}</button>
              <div className={s.hint}>Es el mismo documento con el que te inscribiste.</div>
            </form>
          )}

          {pantalla === "cargando" && <div className={s.loading}><div className="spinner" />{cargandoTxt}</div>}

          {pantalla === "contacto" && vista && fc && (
            <div className={s.form}>
              <div className={c.bloqueDato}>
                <div className={s.smallLabel}>Tu correo</div>
                <div className={c.datoOculto}>{vista.estudiante.correoOculto || "(sin correo)"}</div>
                <div className={c.preguntaCorta} id="t-correo">¿Sigue siendo tu correo?</div>
                <div className={c.sino} role="radiogroup" aria-labelledby="t-correo">
                  <Opcion redonda on={fc.correo === "si"} error={!!errores.correo} onClick={() => setFc({ ...fc, correo: "si" })}>Sí</Opcion>
                  <Opcion redonda on={fc.correo === "no"} error={!!errores.correo} onClick={() => setFc({ ...fc, correo: "no" })}>No, cambió</Opcion>
                </div>
                {errores.correo && <div className="msg-error">{errores.correo}</div>}
                {fc.correo === "no" && (
                  <div style={{ marginTop: 12 }}>
                    <label className="label" htmlFor="correoNuevo">Tu correo actual</label>
                    {k?.correoNuevoOculto && <div className={c.ayuda}>Guardamos {k.correoNuevoOculto}. Escribe otro solo si quieres cambiarlo.</div>}
                    <input id="correoNuevo" type="email" inputMode="email" autoComplete="email" className={`input ${errores.correoNuevo ? "is-error" : ""}`} value={fc.correoNuevo} onChange={(e) => setFc({ ...fc, correoNuevo: e.target.value })} />
                    {errores.correoNuevo && <div className="msg-error">{errores.correoNuevo}</div>}
                    {!errores.correoNuevo && checkEmail(fc.correoNuevo).suggestion && (
                      <div className={s.suggest}>
                        <span>¿Quisiste decir <b>{domainOf(checkEmail(fc.correoNuevo).suggestion!)}</b>?</span>
                        <button type="button" onClick={() => setFc({ ...fc, correoNuevo: checkEmail(fc.correoNuevo).suggestion! })}>Usar</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={c.bloqueDato}>
                <div className={c.preguntaCorta} id="t-genero" style={{ marginTop: 0 }}>Tu género<span className={c.obligatoria} aria-label="obligatoria"> *</span></div>
                <div className={c.opciones} role="radiogroup" aria-labelledby="t-genero">
                  {(Object.entries(GENEROS) as [Genero, string][]).map(([id, texto]) => (
                    <Opcion key={id} redonda on={fc.genero === id} error={!!errores.genero} onClick={() => { setFc({ ...fc, genero: id }); setErrores((x) => ({ ...x, genero: "" })); }}>{texto}</Opcion>
                  ))}
                </div>
                {errores.genero && <div className="msg-error">{errores.genero}</div>}
              </div>

              <div className={c.bloqueDato}>
                <div className={s.smallLabel}>Tu celular</div>
                {fc.celularModo !== "nuevo" ? (
                  <div className={c.filaDato}>
                    <div className={c.datoOculto}>{fc.celularModo === "guardado" ? k?.celularOculto : vista.estudiante.celularOculto}</div>
                    <button type="button" className={`btn-link ${c.cambiar}`} onClick={() => setFc({ ...fc, celularModo: "nuevo" })}>Cambiar número</button>
                  </div>
                ) : (
                  <>
                    <input id="celular" type="tel" inputMode="tel" autoComplete="tel" aria-label="Número de celular" placeholder="Ej.: 300 123 4567" className={`input ${errores.celular ? "is-error" : ""}`} value={fc.celularNuevo} onChange={(e) => setFc({ ...fc, celularNuevo: e.target.value })} />
                    {(k || vista.estudiante.celularOculto) && (
                      <button type="button" className={`btn-link ${c.cambiar}`} onClick={() => setFc({ ...fc, celularModo: k ? "guardado" : "prellenado", celularNuevo: "" })}>Usar el que tenía</button>
                    )}
                  </>
                )}
                {errores.celular && <div className="msg-error">{errores.celular}</div>}

                <div className={c.preguntaCorta} id="t-wa">¿Tienes WhatsApp en este número?</div>
                <div className={c.opciones} role="radiogroup" aria-labelledby="t-wa">
                  <Opcion redonda on={fc.whatsapp === "mismo"} error={!!errores.whatsapp} onClick={() => setFc({ ...fc, whatsapp: "mismo" })}>Sí, en este mismo</Opcion>
                  <Opcion redonda on={fc.whatsapp === "otro"} error={!!errores.whatsapp} onClick={() => setFc({ ...fc, whatsapp: "otro" })}>Mi WhatsApp es otro número</Opcion>
                  <Opcion redonda on={fc.whatsapp === "no"} error={!!errores.whatsapp} onClick={() => setFc({ ...fc, whatsapp: "no" })}>No tengo WhatsApp</Opcion>
                </div>
                {errores.whatsapp && <div className="msg-error">{errores.whatsapp}</div>}
                {fc.whatsapp === "otro" && (
                  <div style={{ marginTop: 12 }}>
                    <label className="label" htmlFor="wa">Número de WhatsApp</label>
                    {k?.whatsappOculto && <div className={c.ayuda}>Guardamos {k.whatsappOculto}. Escribe otro solo si quieres cambiarlo.</div>}
                    <input id="wa" type="tel" inputMode="tel" className={`input ${errores.whatsappNumero ? "is-error" : ""}`} value={fc.whatsappNumero} onChange={(e) => setFc({ ...fc, whatsappNumero: e.target.value })} />
                    {errores.whatsappNumero && <div className="msg-error">{errores.whatsappNumero}</div>}
                  </div>
                )}
              </div>
              {errorGeneral && <div className="msg-error">{errorGeneral}</div>}
              <div className={s.grow} />
              <button type="button" className="btn btn-primary" style={{ marginTop: 22 }} onClick={guardarContacto} disabled={enviando}>
                {enviando ? <span className="spinner-sm" /> : "Siguiente"}
              </button>
            </div>
          )}

          {pantalla === "seccion" && paso && (
            <div className={s.form}>
              {paso.items.map((it) => esPregunta(it)
                ? <CampoPregunta key={it.id} p={it} valor={resp[it.id]} error={errores[it.id]}
                    otro={String(resp[claveOtro(it.id)] ?? "")} errorOtro={errores[claveOtro(it.id)]}
                    onOtro={(t) => { setResp((r) => ({ ...r, [claveOtro(it.id)]: t })); setErrores((e) => { const n = { ...e }; delete n[claveOtro(it.id)]; return n; }); }}
                    onChange={(v) => { setResp((r) => { const n = { ...r }; if (v === undefined || (Array.isArray(v) && !v.length)) delete n[it.id]; else n[it.id] = v; return n; }); setErrores((e) => { const n = { ...e }; delete n[it.id]; return n; }); }} />
                : <Bloque key={it.id} item={it} />)}
              {errorGeneral && <div className="msg-error">{errorGeneral}</div>}
              <div className={s.grow} />
              <button type="button" className="btn btn-primary" style={{ marginTop: 22 }} onClick={siguiente} disabled={enviando}>
                {enviando ? <span className="spinner-sm" /> : "Siguiente"}
              </button>
            </div>
          )}

          {(pantalla === "resumen" || pantalla === "ver" || pantalla === "exito") && vista && (
            <div className={s.form}>
              {pantalla === "exito" && ev && (
                <div className={c.exito}>
                  <div className={c.exitoCheck} aria-hidden><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 12.5l4.2 4.2 8.8-9.2" /></svg></div>
                  <div className={c.exitoTitulo}>{ev.titulo} · {ev.nombreVisible}</div>
                  <EventoInfo ev={ev} conDescripcion={false} />
                </div>
              )}
              {(pantalla === "exito" || pantalla === "ver") && ev && vista.asistira && <Calendario ev={ev} />}
              {pantalla !== "exito" && (
                <>
                  <div className={c.resumenSec}>
                    <div className={c.resumenHead}>
                      <span>Tus datos de contacto</span>
                      {pantalla === "resumen" && <button type="button" className={`btn-link ${c.cambiar}`} onClick={() => ir("contacto")}>Editar</button>}
                    </div>
                    <dl className={c.resumenLista}>
                      <dt>Correo</dt><dd>{k?.correoConfirmado ? vista.estudiante.correoOculto : k?.correoNuevoOculto ?? "—"}</dd>
                      <dt>Celular</dt><dd>{k?.celularOculto || "—"}</dd>
                      <dt>WhatsApp</dt><dd>{!k ? "—" : !k.tieneWhatsApp ? "No tiene" : k.whatsappOculto ?? "En el mismo número"}</dd>
                      <dt>Tu género</dt><dd>{k?.genero ? GENEROS[k.genero as Genero] : "—"}</dd>
                    </dl>
                  </div>
                  {legibles.map((sec) => (
                    <div key={sec.id} className={c.resumenSec}>
                      <div className={c.resumenHead}>
                        <span>{sec.titulo}</span>
                        {pantalla === "resumen" && <button type="button" className={`btn-link ${c.cambiar}`} onClick={() => ir("seccion", sec.id)}>Editar</button>}
                      </div>
                      <dl className={c.resumenLista}>
                        {sec.preguntas.map((q) => <div key={q.id}><dt>{q.titulo}</dt><dd>{q.texto || <span className={c.sinRespuesta}>Sin responder</span>}</dd></div>)}
                      </dl>
                    </div>
                  ))}
                </>
              )}
              {errorGeneral && <div className="msg-error">{errorGeneral}</div>}
              <div className={s.grow} />
              {pantalla === "resumen" && (
                <div className={s.actions}>
                  <button type="button" className="btn btn-green" onClick={enviar} disabled={enviando}>{enviando ? <span className="spinner-sm" /> : editando ? "Enviar cambios" : "Enviar mis respuestas"}</button>
                  {editando && <button type="button" className="btn btn-soft" onClick={() => edicion("cancelar")} disabled={enviando}>Descartar cambios</button>}
                </div>
              )}
              {(pantalla === "ver" || pantalla === "exito") && (
                <div className={s.actions}>
                  {pantalla === "exito" && <button type="button" className="btn btn-soft" onClick={() => ir("ver")}>Ver mis respuestas</button>}
                  {pantalla === "ver" && vista.puedeResponder && <button type="button" className="btn btn-ghost" onClick={() => edicion("empezar")} disabled={enviando}>Editar mis respuestas</button>}
                </div>
              )}
            </div>
          )}

          {(pantalla === "pronto" || pantalla === "cerrado") && (
            <div className={s.form}>
              <div className={`${s.iconBox} ${pantalla === "pronto" ? c.iconoNaranja : s.iconRed}`}><Icono d={I_CAL} /></div>
              {pantalla === "cerrado" && ev && <EventoInfo ev={ev} conDescripcion={false} />}
              <div className={s.grow} />
              <button type="button" className="btn btn-soft" style={{ marginTop: 22 }} onClick={salir}>Volver al inicio</button>
            </div>
          )}

          {pantalla === "noEncontrado" && (
            <div className={s.form}>
              <div className={`${s.iconBox} ${s.iconRed}`}><Icono d="M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.2-4.2" /></div>
              <div className={s.smallLabel}>Número que escribiste</div>
              <div className={s.docShown}>{doc}</div>
              <div className={s.grow} />
              <button type="button" className="btn btn-primary" style={{ marginTop: 22 }} onClick={() => { setDoc(""); ir("portada"); }}>Intentar con otro número</button>
            </div>
          )}
        </section>
      </main>

      <footer className={s.footer}>
        Fundación ROFÉ · Jóvenes creaTIvos · <a href={privacyUrl} target="_blank" rel="noreferrer">Política de privacidad</a>
      </footer>
    </div>
  );
}
