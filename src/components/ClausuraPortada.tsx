"use client";

// Portada pública de la clausura y sus estados (diseño: prototipos/diseno/clausura). Solo presentación: la lógica
// (ingreso, cookie, formulario) sigue en ClausuraFlujo y en la API. Los datos del evento salen siempre de la base;
// lo que no esté definido no se muestra.
import { useRef, type ReactNode } from "react";
import type { VistaEstudiante } from "@/lib/clausura/estudiante";
import type { EventoVista } from "@/lib/clausura/evento";
import type { SeccionLegible } from "@/lib/clausura/formulario/mostrar";
import type { PreguntaFrecuente } from "@/lib/clausura/presentacion";
import p from "./ClausuraPortada.module.css";

export type EventoPortada = Omit<EventoVista, "formulario">;

/** Lo que necesita el formulario del documento (el estado vive en ClausuraFlujo). */
export type Ingreso = {
  doc: string;
  setDoc: (v: string) => void;
  error: string;
  cargando: boolean;
  noEncontrado: boolean;
  enviar: () => void;
  reintentar: () => void;
};

// Línea pequeña de la franja de cierre (igual en celular y computador, página general y de ciudad).
const CIERRE_TEXTO = "¡Nos emociona verte, aplaudir tus logros y celebrar juntos que eres parte de la generación Jóvenes creaTIvos 2026!";

// ---------- Íconos (decorativos: aria-hidden) ----------
const trazo = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Ico = ({ d, t = 20 }: { d: string; t?: number }) => <svg width={t} height={t} viewBox="0 0 24 24" {...trazo} aria-hidden><path d={d} /></svg>;
const D = {
  cal: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z",
  hora: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  lugar: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  flecha: "M5 12h14M13 6l6 6-6 6",
  chat: "M4 5h16v11H9l-5 4V5zM8 9h8M8 12h5",
  reloj: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  abajo: "M6 9l6 6 6-6",
  mapa: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  alerta: "M12 8v5M12 16.5v.5M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  check: "M5.5 12.5l4.2 4.2 8.8-9.2",
  fiesta: "M4 20l4-11 7 7-11 4zM14 4v2M18 6l-1.5 1.5M20 10h-2M15 9l3-3",
};

// ---------- Piezas comunes ----------
function Marco({ children }: { children: ReactNode }) {
  return (
    <div className={p.raiz}>
      <i className={`${p.deco} ${p.decoSol}`} aria-hidden />
      <i className={`${p.deco} ${p.decoCuadro}`} aria-hidden />
      <i className={`${p.deco} ${p.decoPunto}`} aria-hidden />
      {children}
    </div>
  );
}

function Encabezado({ todosLosEventos = false, derecha }: { todosLosEventos?: boolean; derecha?: ReactNode }) {
  return (
    <header className={p.encabezado}>
      <a href="/clausura" aria-label="Clausura · Jóvenes creaTIvos, inicio">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-jc.png" alt="Jóvenes creaTIvos" className={p.logo} />
      </a>
      <nav className={p.nav} aria-label="Ayuda">
        {todosLosEventos ? <a href="/clausura" className={p.navTexto}>Todos los eventos</a> : <span className={p.navTexto}>Fundación ROFÉ</span>}
        {derecha ?? (
          <a href="#ayuda" className={p.chip}>
            <Ico d={D.chat} t={18} />
            <span className={p.chipCorto}>¿Problemas?</span>
            <span className={p.chipLargo}>¿Problemas? Escríbele a tu monitor</span>
          </a>
        )}
      </nav>
    </header>
  );
}

function Pie({ privacyUrl }: { privacyUrl: string }) {
  return (
    <footer className={p.pie}>
      <span><strong>Fundación ROFÉ</strong> · Jóvenes creaTIvos</span>
      <a href={privacyUrl} target="_blank" rel="noreferrer">Política de privacidad</a>
    </footer>
  );
}

/** "¿Problemas?": igual que en la portada de validación, es una indicación (no hay un enlace de contacto). */
function Ayuda({ compacta = false, texto = "Tu monitor te ayuda con gusto.", textoLargo }: { compacta?: boolean; texto?: string; textoLargo?: string }) {
  if (compacta) {
    return (
      <section id="ayuda" className={`${p.ayuda} ${p.ayudaCompacta}`} aria-label="Ayuda">
        <span className={p.ayudaTitulo} style={{ fontSize: 16, fontWeight: 700 }}>¿Problemas?</span>
        <span className={p.ayudaAccion}>Escríbele a tu monitor</span>
      </section>
    );
  }
  return (
    <section id="ayuda" className={p.ayuda} aria-label="Ayuda">
      <div className={p.ayudaFila}>
        <span className={p.ayudaIcono}><Ico d={D.chat} t={24} /></span>
        <div>
          <div className={p.ayudaTitulo}>¿Problemas?</div>
          <div className={p.ayudaTexto}>
            {textoLargo ? <><span className={p.ayudaMovil}>{texto}</span><span className={p.ayudaEscritorio}>{textoLargo}</span></> : texto}
          </div>
        </div>
      </div>
      <span className={p.ayudaAccion}><Ico d={D.chat} t={20} />Escríbele a tu monitor</span>
    </section>
  );
}

const altPortada = (e: Pick<EventoPortada, "titulo" | "nombreVisible">) => `Portada de ${e.titulo} – ${e.nombreVisible}`;

/** Formulario del documento con sus estados: normal, buscando y documento no encontrado. */
function FormDocumento({ ingreso, titulo = "Confirma tu asistencia", boton = "Entrar" }: { ingreso: Ingreso; titulo?: string; boton?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { doc, setDoc, error, cargando, noEncontrado } = ingreso;
  return (
    <>
      <form className={p.tarjetaForm} onSubmit={(e) => { e.preventDefault(); if (noEncontrado) { ingreso.reintentar(); ref.current?.focus(); ref.current?.select(); } else ingreso.enviar(); }} aria-busy={cargando}>
        <div className={p.formTitulo}>{titulo}</div>
        <label className={p.label} htmlFor="doc">Número de documento</label>
        <input
          id="doc" ref={ref} className={`${p.input} ${noEncontrado || error ? p.inputError : ""}`} value={doc} readOnly={cargando}
          onChange={(e) => setDoc(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni espacios"
          aria-invalid={noEncontrado || !!error} aria-describedby={noEncontrado ? "doc-no" : error ? "doc-error" : "doc-pista"}
        />
        {noEncontrado && (
          <div className={p.cajaError} id="doc-no" role="alert">
            <Ico d={D.alerta} t={22} />
            <div>
              <div className={p.cajaErrorTitulo}>Uy, no encontramos ese documento</div>
              <ul>
                <li>Escríbelo <strong>sin puntos ni espacios</strong>.</li>
                <li>Usa el mismo documento con el que te inscribiste al programa.</li>
              </ul>
            </div>
          </div>
        )}
        {error && !noEncontrado && <div className={p.mensajeError} id="doc-error" role="alert">{error}</div>}
        <button type="submit" className={p.boton} disabled={cargando}>
          {cargando ? <>Buscando tu invitación…<span className={p.girar} aria-hidden /></> : noEncontrado ? "Intentar de nuevo" : <>{boton}<Ico d={D.flecha} /></>}
        </button>
        {!noEncontrado && <p className={p.pista} id="doc-pista">Es el mismo documento con el que te inscribiste.</p>}
      </form>
      {cargando && <div className={p.esqueleto} aria-hidden><i /><i /><i /></div>}
      {noEncontrado && (
        <div className={p.ayuda} style={{ marginTop: 18 }}>
          <div className={p.ayudaTexto} style={{ color: "var(--cl-tinta)" }}><strong>¿Sigue sin aparecer?</strong> Tu monitor lo revisa y te ayuda a confirmar.</div>
          <span className={p.ayudaAccion}>Escríbele a tu monitor</span>
        </div>
      )}
    </>
  );
}

function TarjetaEvento({ e }: { e: EventoPortada }) {
  const t = e.portada;
  return (
    <a href={`/clausura/${e.slug}`} className={p.tarjeta} aria-label={`${t.etiquetaTipo === "CLAUSURA" ? "Clausura" : "EXPOFeria y clausura"} en ${e.nombreVisible}: ver el evento`}>
      <div className={p.tarjetaFoto}>
        {e.imagen
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={e.imagen} alt={altPortada(e)} className={p.tarjetaImg} />
          : <div className={p.tarjetaImg} aria-hidden />}
        <span className={`${p.badge} ${e.tipo === "expoferia" ? p.badgeExpoferia : p.badgeClausura}`}>{t.etiquetaTipo}</span>
      </div>
      <div className={p.tarjetaCuerpo}>
        <h3 className={p.ciudad}>{e.nombreVisible}</h3>
        <div className={p.lineas}>
          <div className={p.linea}><Ico d={D.cal} t={18} /><strong>{e.dia}</strong></div>
          {t.horaRango && <div className={p.linea}><Ico d={D.hora} t={18} /><span>{t.horaRango} ({t.zonaTexto.charAt(0).toLowerCase() + t.zonaTexto.slice(1)})</span></div>}
          {t.lugar && <div className={p.linea}><Ico d={D.lugar} t={18} /><span>{t.lugar}</span></div>}
        </div>
        {t.limiteDia && e.aceptaRespuestas && <div className={p.limite}><Ico d={D.reloj} t={18} />Confirma hasta el {t.limiteDia.charAt(0).toLowerCase() + t.limiteDia.slice(1)}</div>}
      </div>
    </a>
  );
}

// ---------- Página general (/clausura) ----------
export function PaginaGeneral({ eventos, faq, ingreso, privacyUrl }: { eventos: EventoPortada[]; faq: PreguntaFrecuente[]; ingreso: Ingreso; privacyUrl: string }) {
  return (
    <Marco>
      <i className={`${p.deco} ${p.decoAro} ${p.soloEscritorio}`} aria-hidden />
      <div className={p.contenedor}>
        <Encabezado />
        <main>
          <section className={p.heroGrid}>
            <div className={p.heroTexto}>
              <div className={p.etiqueta}><Ico d={D.fiesta} t={16} />Clausura 2026</div>
              <h1 className={p.h1}>¡Lo lograste, <br /><span className={p.naranja}>joven creaTIv@!</span></h1>
              <p className={p.lead}>
                Hace unos meses comenzamos juntos una aventura llena de retos, aprendizajes y nuevas amistades. Hoy llegamos a la meta y <strong>queremos celebrar contigo</strong>
                <span className={p.ayudaEscritorio}> cada logro y todo lo que has crecido</span>. ¡Esta celebración no estaría completa sin ti!
              </p>
            </div>
            <div className={p.heroForm}><FormDocumento ingreso={ingreso} /></div>
          </section>

          <section className={p.seccion} aria-labelledby="t-ciudades">
            <h2 className={p.h2} id="t-ciudades">Las clausuras por ciudad</h2>
            <p className={p.sub}>Al entrar con tu documento te llevamos a la de tu ciudad.</p>
            <div className={p.tarjetas}>
              {eventos.map((e) => <TarjetaEvento key={e.slug} e={e} />)}
              <div className={p.vacio}>
                <Ico d={D.lugar} t={40} />
                Aquí aparecen las demás ciudades cuando se publiquen
              </div>
            </div>
          </section>

          <section className={p.pasos} aria-labelledby="t-pasos">
            <svg className={p.pasosDeco} width="140" height="140" viewBox="0 0 140 140" aria-hidden>
              <circle cx="90" cy="50" r="40" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="18" />
              <rect x="20" y="96" width="16" height="16" rx="4" fill="#ffc845" transform="rotate(20 28 104)" />
            </svg>
            <h2 className={p.h2} id="t-pasos">¿Cómo confirmo?</h2>
            <ol className={p.pasosLista}>
              <li className={p.paso}><span className={`${p.num} ${p.num1}`}>1</span><div><div className={p.pasoTitulo}>Escribe tu documento</div><div className={p.pasoTexto}>El mismo con el que te inscribiste.</div></div></li>
              <li className={p.paso}><span className={`${p.num} ${p.num2}`}>2</span><div><div className={p.pasoTitulo}>Responde el formulario</div><div className={p.pasoTexto}>Toma menos de un minuto.</div></div></li>
              <li className={p.paso}><span className={`${p.num} ${p.num3}`}>3</span><div><div className={p.pasoTitulo}>Agrégalo a tu calendario</div><div className={p.pasoTexto}>Para que no se te pase el gran día.</div></div></li>
            </ol>
          </section>

          <section className={`${p.seccion} ${p.faqAyuda}`}>
            <div>
              <h2 className={p.h2}>Preguntas frecuentes</h2>
              <div className={p.faqLista}>
                {faq.map((f) => (
                  <details key={f.pregunta} className={p.faq}>
                    <summary>{f.pregunta}<Ico d={D.abajo} t={20} /></summary>
                    <p>{f.respuesta}</p>
                  </details>
                ))}
              </div>
            </div>
            <Ayuda textoLargo="Si algo no funciona o tienes dudas, tu monitor te ayuda con gusto." />
          </section>

          <p className={p.cierre}>Esta no es solo una clausura: es la celebración de <span className={p.naranja}>todo lo que eres capaz de lograr.</span></p>
          <p className={p.cierreTexto}>{CIERRE_TEXTO}</p>
        </main>
        <Pie privacyUrl={privacyUrl} />
      </div>
    </Marco>
  );
}

// ---------- Página de ciudad (/clausura/[slug]) ----------
function DatosEvento({ ev }: { ev: EventoPortada }) {
  const t = ev.portada;
  return (
    <div className={p.datos}>
      <div className={p.dato}>
        <span className={`${p.datoIcono} ${p.iconoDurazno}`}><Ico d={D.cal} t={22} /></span>
        <div><div className={p.datoLabel}>Fecha</div><div className={p.datoValor}>{ev.dia}</div></div>
      </div>
      {t.horaRango && (
        <div className={p.dato}>
          <span className={`${p.datoIcono} ${p.iconoSol}`}><Ico d={D.hora} t={22} /></span>
          <div>
            <div className={p.datoLabel}>Hora</div>
            <div className={p.datoValor}>{t.horaRango}</div>
            {ev.llegada && <div className={p.datoSub}>Llegada: {ev.llegada}</div>}
            <div className={p.datoSub}>{t.zonaTexto}</div>
          </div>
        </div>
      )}
      {(t.lugar || t.direccion) && (
        <div className={p.dato}>
          <span className={`${p.datoIcono} ${p.iconoAzul}`}><Ico d={D.lugar} t={22} /></span>
          <div>
            <div className={p.datoLabel}>Lugar</div>
            {t.lugar && <div className={p.datoValor}>{t.lugar}</div>}
            {t.direccion && <div className={p.datoDireccion}>{t.direccion}</div>}
            <a className={p.mapa} href={ev.mapa} target="_blank" rel="noreferrer">Ver en el mapa<Ico d={D.mapa} t={16} /></a>
          </div>
        </div>
      )}
    </div>
  );
}

function PortadaCiudad({ ev, children }: { ev: EventoPortada; children?: ReactNode }) {
  return (
    <div className={p.portadaWrap}>
      {ev.imagen
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={ev.imagen} alt={altPortada(ev)} className={p.portadaImg} />
        : <div className={p.portadaImg} aria-hidden />}
      {children}
    </div>
  );
}

export function PaginaCiudad({ ev, ingreso, privacyUrl }: { ev: EventoPortada; ingreso: Ingreso; privacyUrl: string }) {
  const t = ev.portada;
  return (
    <Marco>
      <i className={`${p.deco} ${p.decoAro}`} aria-hidden />
      <div className={`${p.contenedor} ${p.contenedorCiudad}`}>
        <Encabezado todosLosEventos />
        <main>
          <PortadaCiudad ev={ev}>
            {t.etiquetaCiudad && <span className={`${p.portadaEtiqueta} ${ev.tipo === "expoferia" ? p.portadaEtiquetaExpo : ""}`}>{t.etiquetaCiudad}</span>}
          </PortadaCiudad>
          <section className={p.ciudadIntro}>
            <h1 className={p.h1}>¡Lo <span className={p.naranja}>lograste!</span></h1>
            <p className={p.lead}>
              {t.invitacion ? <>Te invitamos a la <strong>{t.invitacion}</strong>. </> : null}
              Queremos celebrar contigo cada logro, cada desafío superado y todo lo que has crecido en este camino.
              <span className={p.ayudaEscritorio}> ¡Esta celebración no estaría completa sin ti!</span>
            </p>
          </section>
          <section className={p.ciudadGrid}>
            <div className={p.ciudadIzq}>
              {t.limiteDia && (
                <div className={p.limiteBanner}>
                  <span className={p.limiteIcono}><Ico d={D.reloj} t={22} /></span>
                  <div><div className={p.limiteKicker}>CONFIRMA HASTA EL</div><div className={p.limiteDia}>{t.limiteDia}</div></div>
                  {t.quedan && <span className={p.quedan}>{t.quedan}</span>}
                </div>
              )}
              <FormDocumento ingreso={ingreso} />
            </div>
            <div className={p.ciudadDer}>
              <h2 className={p.h2} style={{ fontSize: 24 }}>Datos del evento</h2>
              <DatosEvento ev={ev} />
              <p className={p.otraCiudad}>¿No eres de {ev.nombreVisible}? <a href="/clausura">Ver todos los eventos</a></p>
            </div>
          </section>
          <section className={p.banda}>
            <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden><circle cx="70" cy="70" r="36" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="16" /><circle cx="22" cy="24" r="7" fill="#ffc845" /></svg>
            <p className={p.bandaTitulo}>
              <span className={p.ayudaMovil}>¡Esta celebración no estaría completa sin ti!</span>
              <span className={p.ayudaEscritorio}>Esta no es solo una clausura: es la celebración de todo lo que eres capaz de lograr.</span>
            </p>
            <p className={p.bandaTexto}>
              {CIERRE_TEXTO}
            </p>
          </section>
          <Ayuda compacta />
        </main>
        <Pie privacyUrl={privacyUrl} />
      </div>
    </Marco>
  );
}

// ---------- Estados ----------
function Estado({ children, privacyUrl, derecha }: { children: ReactNode; privacyUrl: string; derecha?: ReactNode }) {
  return (
    <Marco>
      <div className={p.contenedor}>
        <Encabezado todosLosEventos derecha={derecha} />
        <main className={p.estado}>{children}</main>
        <Pie privacyUrl={privacyUrl} />
      </div>
    </Marco>
  );
}

/** 3 · El documento es de otra ciudad: se muestra su evento en vez de redirigir solo. */
export function EstadoOtraCiudad({ pagina, suyo, nombre, privacyUrl, salir }: { pagina: EventoPortada; suyo: EventoPortada; nombre: string; privacyUrl: string; salir: ReactNode }) {
  return (
    <Estado privacyUrl={privacyUrl} derecha={salir}>
      <div className={p.estadoKicker}>Estás en la página de {pagina.nombreVisible}</div>
      <h1 className={p.estadoTitulo}>¡Hola, {nombre}! Tu {suyo.fraseTipo} es en <span className={p.naranja}>{suyo.nombreVisible}</span></h1>
      <p className={p.estadoTexto}>Te llevamos a tu evento para que confirmes allá.</p>
      <article className={p.tuEvento}>
        <div className={p.tarjetaFoto}>
          {suyo.imagen
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={suyo.imagen} alt={altPortada(suyo)} className={p.tuEventoImg} />
            : <div className={p.tuEventoImg} aria-hidden />}
          <span className={`${p.badge} ${p.badgeExpoferia}`}>TU EVENTO</span>
        </div>
        <div className={p.tuEventoCuerpo}>
          <div className={p.tuEventoTipo}>{suyo.portada.etiquetaTipo}</div>
          <div className={p.tuEventoCiudad}>{suyo.nombreVisible}</div>
          <div className={p.tuEventoDatos}>{[suyo.dia, suyo.portada.lugar].filter(Boolean).join(" · ")}</div>
          <a className={p.boton} href={`/clausura/${suyo.slug}`}>Ir a mi evento en {suyo.nombreVisible}<Ico d={D.flecha} /></a>
        </div>
      </article>
      <p className={p.nota}>¿Crees que es un error? <strong>Escríbele a tu monitor</strong></p>
    </Estado>
  );
}

/** 4 · Ya confirmó (también la pantalla de éxito, justo después de enviar). */
export function EstadoEnviada({ ev, vista, recien, asistencia, enviadaTexto, secciones, salir, privacyUrl, editar }: {
  ev: EventoPortada; vista: VistaEstudiante; recien: boolean; asistencia: string | null; enviadaTexto: string | null;
  secciones: SeccionLegible[]; salir: ReactNode; privacyUrl: string; editar?: ReactNode;
}) {
  const nombre = vista.estudiante.nombre.split(" ")[0];
  const t = ev.portada;
  return (
    <Estado privacyUrl={privacyUrl} derecha={salir}>
      <div className={p.centro}>
        <span className={p.check}><Ico d={D.check} t={38} /></span>
        <h1 className={p.estadoTitulo} style={{ marginTop: 20 }}>{recien ? `¡Listo, ${nombre}!` : `¡Ya confirmaste, ${nombre}!`}</h1>
        <p className={p.estadoTexto}>{vista.asistira ? `Te esperamos en la ${ev.fraseTipo} de ${ev.nombreVisible}.` : "Gracias por contarnos. Guardamos tu respuesta."}</p>
      </div>
      <div className={p.resumen}>
        <div className={p.resumenKicker}>TU RESUMEN</div>
        {asistencia && <div className={p.resumenFila}><span>Asistencia</span><strong>{asistencia}</strong></div>}
        <div className={p.resumenFila}><span>Evento</span><strong>{t.diaCorto} · {t.horaInicio}</strong></div>
        {t.lugar && <div className={p.resumenFila}><span>Lugar</span><strong>{t.lugar}</strong></div>}
        {enviadaTexto && <div className={p.resumenFila}><span>Enviada</span><strong>{enviadaTexto}</strong></div>}
      </div>
      <div className={p.acciones}>
        {vista.asistira && <a className={p.boton} href={ev.calendario.ics} download={`${ev.slug}.ics`}>Agregar a mi calendario<Ico d={D.cal} /></a>}
        {vista.asistira && <a className={p.enlaceCentro} href={ev.calendario.google} target="_blank" rel="noreferrer">Agregar a Google Calendar</a>}
        <a className={p.enlaceCentro} href={ev.mapa} target="_blank" rel="noreferrer">Ver en el mapa<Ico d={D.mapa} t={16} /></a>
      </div>
      {editar ?? <p className={p.notaSol}>Tu respuesta ya no se puede editar. ¿Necesitas cambiar algo? <strong>Escríbele a tu monitor</strong></p>}
      {secciones.length > 0 && (
        <details className={p.detalle}>
          <summary>Ver todas mis respuestas</summary>
          {secciones.map((s) => (
            <div key={s.id} className={p.detalleSec}>
              <h3>{s.titulo}</h3>
              <dl>{s.preguntas.map((q) => <div key={q.id}><dt>{q.titulo}</dt><dd>{q.texto || "—"}</dd></div>)}</dl>
            </div>
          ))}
        </details>
      )}
    </Estado>
  );
}

/** 5 · Confirmaciones cerradas (fecha límite vencida o evento cerrado). Con la opción de consultar lo ya enviado. */
export function EstadoVencida({ ev, privacyUrl, consulta, salir }: { ev: EventoPortada; privacyUrl: string; consulta?: Ingreso; salir?: ReactNode }) {
  const t = ev.portada;
  const limite = t.limiteDia ? t.limiteDia.charAt(0).toLowerCase() + t.limiteDia.slice(1) : null;
  return (
    <Estado privacyUrl={privacyUrl} derecha={salir}>
      <div className={p.cerradoWrap}>
        {ev.imagen
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={ev.imagen} alt={altPortada(ev)} className={p.cerradoImg} />
          : <div className={p.cerradoImg} aria-hidden />}
        <span className={p.cerradoChip}>CONFIRMACIONES CERRADAS</span>
      </div>
      <h1 className={p.estadoTitulo} style={{ marginTop: 26, fontSize: 30 }}>Las confirmaciones ya cerraron</h1>
      <p className={p.estadoTexto}>{limite ? <>El plazo para {ev.nombreVisible} fue hasta el <strong>{limite}</strong>.</> : <>Ya no se reciben confirmaciones para {ev.nombreVisible}.</>}</p>
      <div className={p.sigueEnPie}>
        <div className={p.resumenKicker} style={{ padding: 0 }}>EL EVENTO SIGUE EN PIE</div>
        <strong>{ev.dia} · {t.horaInicio}</strong>
        {t.lugar && <span>{t.lugar}, {ev.nombreVisible}</span>}
      </div>
      <div className={p.ayuda} style={{ marginTop: 16 }}>
        <div className={p.ayudaTexto} style={{ color: "var(--cl-tinta)" }}><strong>¿No alcanzaste a confirmar y quieres ir?</strong> Escríbele a tu monitor para revisar tu caso.</div>
        <span className={p.ayudaAccion}>Escríbele a tu monitor</span>
      </div>
      {consulta && (
        <details className={p.consulta}>
          <summary>¿Ya habías confirmado? Consulta tu respuesta</summary>
          <FormDocumento ingreso={consulta} titulo="Consulta tu confirmación" boton="Ver mi respuesta" />
        </details>
      )}
    </Estado>
  );
}

/** Ciudad sin evento publicado. */
export function EstadoPronto({ privacyUrl, volver }: { privacyUrl: string; volver: () => void }) {
  return (
    <Estado privacyUrl={privacyUrl}>
      <div className={p.estadoKicker}>Muy pronto</div>
      <h1 className={p.estadoTitulo}>Pronto publicaremos la información de tu ciudad</h1>
      <p className={p.estadoTexto}>Vuelve a entrar en unos días. Si tienes dudas, escríbele a tu monitor.</p>
      <div className={p.acciones}><button type="button" className={p.botonSecundario} onClick={volver}>Volver al inicio</button></div>
    </Estado>
  );
}

/** Estudiante inactivo: no entra al formulario. Mismo trato que en validación. */
export function EstadoInactivo({ privacyUrl, volver }: { privacyUrl: string; volver: () => void }) {
  return (
    <Estado privacyUrl={privacyUrl}>
      <div className={p.estadoKicker}>Necesitamos revisar algo</div>
      <h1 className={p.estadoTitulo}>Escríbele a tu monitor</h1>
      <p className={p.estadoTexto}>Tu monitor te ayuda a revisar tu confirmación para la clausura.</p>
      <div className={p.acciones}><button type="button" className={p.botonSecundario} onClick={volver}>Volver al inicio</button></div>
    </Estado>
  );
}

export { p as estilosPortada };
