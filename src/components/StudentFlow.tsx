"use client";

import { useState } from "react";
import type { StudentView } from "@/lib/student-view";
import { checkEmail, domainOf, emailError } from "@/lib/validation/email";
import { cleanSpaces, NAME_WARNING_TEXT, nameWarnings, toProperName } from "@/lib/validation/name";
import s from "./StudentFlow.module.css";

type Step = "ingreso" | "cargando" | "revision" | "correccion" | "exito" | "noEncontrado" | "yaValidado";
type Validado = { nombre: string; correo: string; validadoEn: string | null };

// [kicker, título, subtítulo, color del kicker]: textos del prototipo.
const COPY: Record<string, [string, string, string, string]> = {
  ingreso: ["Certificados 2026", "Valida tus datos para tu certificado", "Te toma menos de un minuto. Solo necesitas tu número de documento.", "var(--orange-dark)"],
  revision: ["Revisa tus datos", "Hola, {n}. ¿Así está bien?", "Así como los ves aquí saldrán en tu certificado.", "var(--orange-dark)"],
  correccion: ["Corrige tus datos", "Escríbelos tal como quieres que salgan", "Usa tildes y mayúsculas donde van, y un correo personal que seguirás usando.", "var(--orange-dark)"],
  exito: ["Todo listo", "¡Listo! Tus datos quedaron validados", "Tu certificado llegará a este correo. Ya puedes cerrar esta página.", "var(--green-dark)"],
  enviado: ["Todo listo", "¡Listo! Recibimos tus datos", "Tu monitor revisará el cambio. Tu certificado llegará a este correo. Ya puedes cerrar esta página.", "var(--green-dark)"],
  noEncontrado: ["Algo no cuadra", "Tu documento no aparece", "Escríbele a tu monitor para que te agregue. Revisa también que el número esté bien escrito.", "var(--red-ink)"],
  yaValidado: ["Todo en orden", "Ya validaste tus datos", "No tienes que hacer nada más. Si necesitas un cambio, escríbele a tu monitor.", "var(--green-dark)"],
};

const RED_NET = "No pudimos conectarnos. Revisa tu internet e intenta otra vez.";

function fechaCorta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const fecha = d.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).replace(".", "");
  const hora = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
  return `Validado el ${fecha} · ${hora}`;
}

function Alert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5" /><path d="M12 16.5v.5" />
    </svg>
  );
}

function Confirmo({ on, error, onToggle }: { on: boolean; error: boolean; onToggle: () => void }) {
  return (
    <>
      <button type="button" role="checkbox" aria-checked={on} onClick={onToggle} className={`check ${on ? "is-on" : ""} ${error && !on ? "is-error" : ""}`}>
        <span className="check-box">{on ? "✓" : ""}</span>
        <span>Confirmo que este es mi correo personal y lo seguiré usando</span>
      </button>
      {error && !on && <div className="msg-error">Marca la casilla para continuar</div>}
    </>
  );
}

export default function StudentFlow({ privacyUrl }: { privacyUrl: string }) {
  const [step, setStep] = useState<Step>("ingreso");
  const [prev, setPrev] = useState<Step>("ingreso"); // para los textos mientras carga
  const [loadingText, setLoadingText] = useState("");
  const [doc, setDoc] = useState("");
  const [docErr, setDocErr] = useState("");
  const [data, setData] = useState<StudentView | null>(null);
  const [validado, setValidado] = useState<Validado | null>(null);
  const [resultado, setResultado] = useState<"validado" | "corregido">("validado");
  const [final, setFinal] = useState({ nombre: "", correo: "" });
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmErr, setConfirmErr] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState("");

  function load(text: string) {
    setPrev(step);
    setLoadingText(text);
    setServerErr("");
    setStep("cargando");
  }

  async function buscar() {
    const d = doc.replace(/[^0-9a-zA-Z]/g, "");
    if (!d) return setDocErr("Escribe tu número de documento");
    if (d.length < 3) return setDocErr("Revisa el número: parece incompleto");
    load("Buscando tus datos…");
    try {
      const res = await fetch("/api/estudiante/buscar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documento: d }) });
      if (res.status === 404) return setStep("noEncontrado");
      if (res.status === 429) {
        setStep("ingreso");
        return setDocErr((await res.json().catch(() => ({}))).mensaje ?? "Demasiados intentos. Espera unos minutos.");
      }
      if (res.status === 403) return window.location.assign("/cerrado");
      if (!res.ok) throw new Error();
      const body = await res.json();
      if (body.estado === "validado") {
        setValidado(body);
        return setStep("yaValidado");
      }
      setData(body);
      setConfirm(false);
      setConfirmErr(false);
      setStep("revision");
    } catch {
      setStep("ingreso");
      setDocErr(RED_NET);
    }
  }

  async function guardar(accion: "confirmar" | "corregir") {
    if (!data) return;
    const vuelta = accion === "confirmar" ? "revision" : "correccion";
    load("Guardando tus datos…");
    try {
      const res = await fetch("/api/estudiante/guardar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: data.id, documento: doc, accion, aceptaCorreoPersonal: true,
          ...(accion === "corregir" ? { nombre: eName, correo: eEmail } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) return buscar(); // ya estaba validado
      if (res.status === 403) return window.location.assign("/cerrado");
      if (!res.ok) {
        setStep(vuelta);
        return setServerErr(body.mensaje ?? "No pudimos guardar tus datos. Intenta otra vez.");
      }
      setResultado(body.estado);
      setFinal(accion === "corregir" ? { nombre: toProperName(eName), correo: checkEmail(eEmail).email } : { nombre: data.nombre, correo: data.correo });
      setStep("exito");
    } catch {
      setStep(vuelta);
      setServerErr(RED_NET);
    }
  }

  function irCorregir() {
    if (!data) return;
    setEName(data.nombre);
    setEEmail(data.correo);
    setConfirm(false);
    setConfirmErr(false);
    setSubmitted(false);
    setServerErr("");
    setStep("correccion");
  }

  function reiniciar() {
    setDoc("");
    setDocErr("");
    setData(null);
    setStep("ingreso");
  }

  function goBack() {
    setServerErr("");
    setStep(step === "correccion" ? "revision" : "ingreso");
  }

  // ----- Validaciones de los formularios -----
  const actual = data ? checkEmail(data.correo) : null;
  const actualErr = actual ? emailError(actual) : null;

  const nameIssues = nameWarnings(eName);
  const nameErr = !cleanSpaces(eName) ? "Escribe tu nombre completo" : nameIssues.includes("incompleto") ? "Escribe nombre y apellido(s)" : "";
  const nameWarn = nameIssues.includes("sin_tildes") ? "Tu nombre no tiene ninguna tilde. ¿Está bien escrito?" : "";
  const eCheck = checkEmail(eEmail);
  const eErr = emailError(eCheck);
  const emailTyped = eCheck.valid || (eEmail.includes("@") && /\.[a-z]{2,}/i.test(eEmail.split("@")[1] ?? ""));
  const showEmailErr = submitted || emailTyped;

  function onConfirmar() {
    if (actualErr) return;
    if (!confirm) return setConfirmErr(true);
    guardar("confirmar");
  }

  function onGuardarCorreccion() {
    setSubmitted(true);
    if (!confirm) setConfirmErr(true);
    if (nameErr || eErr || !confirm) return;
    guardar("corregir");
  }

  // ----- Textos de la columna izquierda -----
  const copyKey = step === "cargando" ? prev : step === "exito" && resultado === "corregido" ? "enviado" : step;
  const [kicker, title, sub, kickerColor] = COPY[copyKey] ?? COPY.ingreso;
  const firstName = (data?.nombre ?? "").split(" ")[0];
  const progIdx = ({ revision: 1, correccion: 2 } as Partial<Record<Step, number>>)[step] ?? 0;
  const canBack = step === "revision" || step === "correccion" || step === "noEncontrado";

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
      </header>

      <main className={s.main}>
        <section className={`${s.intro} ${step === "revision" ? s.introCompact : ""}`}>
          {canBack && (
            <button type="button" className={s.back} onClick={goBack}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
              Atrás
            </button>
          )}
          {progIdx > 0 && (
            <div className={s.progress}>
              <div className={s.bars}>
                {[1, 2].map((k) => <div key={k} className={`${s.bar} ${k <= progIdx ? s.barOn : ""}`} />)}
              </div>
              <span className={s.stepLabel}>Paso {progIdx} de 2</span>
            </div>
          )}
          <div className={`kicker ${s.kicker}`} style={{ color: kickerColor }}>{kicker}</div>
          <h1 className={s.title}>{title.replace("{n}", firstName)}</h1>
          <p className={s.sub}>{sub}</p>
        </section>

        <section className={s.card} aria-live="polite">
          {step === "ingreso" && (
            <form className={s.form} onSubmit={(e) => { e.preventDefault(); buscar(); }}>
              <label className="label" htmlFor="doc">Número de documento</label>
              <input
                id="doc" className={`input ${s.docInput} ${docErr ? "is-error" : ""}`} value={doc}
                onChange={(e) => { setDoc(e.target.value); setDocErr(""); }}
                inputMode="numeric" autoComplete="off" placeholder="Sin puntos ni espacios" autoFocus
              />
              {docErr && <div className="msg-error">{docErr}</div>}
              <div className={s.grow} />
              <button type="submit" className="btn btn-primary" style={{ marginTop: 22 }}>Buscar mis datos</button>
              <div className={s.hint}>Es el mismo documento con el que te inscribiste.</div>
            </form>
          )}

          {step === "cargando" && (
            <div className={s.loading}><div className="spinner" />{loadingText}</div>
          )}

          {step === "revision" && data && (
            <>
              <div className={s.cert}>
                <div className={s.certRing} />
                <div className={s.certLabel}>Así aparecerá en tu certificado:</div>
                <div className={s.certName}>{data.nombre}</div>
                <div className={s.certEmail}>{data.correo || "(sin correo)"}</div>
              </div>
              <div className={s.stack}>
                {data.estado === "corregido" && (
                  <div className="note note-info"><Alert /><span>Ya enviaste una corrección y tu monitor la va a revisar. Si hace falta, puedes cambiarla otra vez.</span></div>
                )}
                {/* Un solo aviso, el más importante, para que los botones quepan en el celular. */}
                {actualErr ? (
                  <div className="note note-error"><Alert /><span>{actualErr} Toca <b>Corregir</b> para cambiarlo.</span></div>
                ) : data.avisos.sugerencia ? (
                  <div className="note note-warn"><Alert /><span>¿Tu correo es <b>{data.avisos.sugerencia}</b>? Si es así, toca <b>Corregir</b>.</span></div>
                ) : data.avisos.nombre.includes("sin_tildes") ? (
                  <div className="note note-warn"><Alert /><span>{NAME_WARNING_TEXT.sin_tildes}</span></div>
                ) : (
                  <div className="note note-warn"><Alert /><span>Revisa tildes, mayúsculas y que sea un correo personal que seguirás usando (no del colegio ni universidad).</span></div>
                )}
              </div>
              <div className={s.grow} />
              {!actualErr && <div style={{ marginTop: 16 }}><Confirmo on={confirm} error={confirmErr} onToggle={() => { setConfirm(!confirm); setConfirmErr(false); }} /></div>}
              {serverErr && <div className="msg-error">{serverErr}</div>}
              <div className={`${s.actions} ${s.actionsRow}`}>
                <button type="button" className={`btn btn-green ${s.btnRow}`} onClick={onConfirmar} disabled={!!actualErr}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9.5" /><path d="M7.8 12.4l2.8 2.8 5.6-6" /></svg>
                  Mis datos están bien
                </button>
                <button type="button" className={`btn btn-ghost ${s.btnRow}`} onClick={irCorregir}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
                  Corregir
                </button>
              </div>
            </>
          )}

          {step === "correccion" && (
            <>
              <div className={s.field}>
                <label className="label" htmlFor="nombre">Nombre completo</label>
                <input id="nombre" className={`input ${submitted && nameErr ? "is-error" : nameWarn ? "is-warn" : ""}`} value={eName} onChange={(e) => setEName(e.target.value)} autoComplete="name" />
                {submitted && nameErr && <div className="msg-error">{nameErr}</div>}
                {!nameErr && nameWarn && <div className="msg-warn">{nameWarn}</div>}
              </div>
              <div className={s.field}>
                <label className="label" htmlFor="correo">Correo personal</label>
                <input id="correo" type="email" inputMode="email" autoComplete="email" className={`input ${showEmailErr && eErr ? "is-error" : eCheck.suggestion ? "is-warn" : ""}`} value={eEmail} onChange={(e) => setEEmail(e.target.value)} />
                {showEmailErr && eErr && <div className="msg-error">{eErr}</div>}
                {!eErr && eCheck.suggestion && (
                  <div className={s.suggest}>
                    <span>¿Quisiste decir <b>{domainOf(eCheck.suggestion)}</b>?</span>
                    <button type="button" onClick={() => setEEmail(eCheck.suggestion!)}>Usar</button>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 20 }}><Confirmo on={confirm} error={confirmErr} onToggle={() => { setConfirm(!confirm); setConfirmErr(false); }} /></div>
              {serverErr && <div className="msg-error">{serverErr}</div>}
              <div className={s.grow} />
              <button type="button" className="btn btn-primary" style={{ marginTop: 22 }} onClick={onGuardarCorreccion}>Guardar mis datos</button>
            </>
          )}

          {step === "exito" && (
            <>
              <div className={s.burst} aria-hidden>
                <div className={s.burstRing} />
                <div className={s.burstCheck}>
                  <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5.5 12.5l4.2 4.2 8.8-9.2" /></svg>
                </div>
                <i className={s.dot} style={{ left: "16%", top: 24, width: 22, height: 22, borderRadius: "50%", background: "var(--sun)" }} />
                <i className={s.dot} style={{ right: "18%", top: 14, width: 16, height: 16, background: "var(--blue)", transform: "rotate(20deg)", borderRadius: 4 }} />
                <i className={s.dot} style={{ right: "14%", bottom: 40, width: 26, height: 26, borderRadius: "50%", border: "5px solid var(--orange)" }} />
                <i className={s.dot} style={{ left: "18%", bottom: 24, width: 14, height: 14, background: "#E2407A", transform: "rotate(45deg)", borderRadius: 3 }} />
                <i className={s.dot} style={{ left: "9%", top: 104, width: 10, height: 10, borderRadius: "50%", background: "#7BC043" }} />
              </div>
              <div className={s.summary}>
                <div className={s.summaryLabel}>{resultado === "corregido" ? "ENVIADO PARA REVISIÓN" : "EN TU CERTIFICADO"}</div>
                <div className={s.summaryName}>{final.nombre}</div>
                <div className={s.summaryEmail}>{final.correo}</div>
              </div>
            </>
          )}

          {step === "noEncontrado" && (
            <>
              <div className={`${s.iconBox} ${s.iconRed}`}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>
              </div>
              <div className={s.smallLabel}>Número que escribiste</div>
              <div className={s.docShown}>{doc}</div>
              <div className={s.grow} />
              <button type="button" className="btn btn-primary" style={{ marginTop: 22 }} onClick={reiniciar}>Intentar con otro número</button>
            </>
          )}

          {step === "yaValidado" && validado && (
            <>
              <div className={`${s.iconBox} ${s.iconGreen}`}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5.5 12.5l4.2 4.2 8.8-9.2" /></svg>
              </div>
              <div className={s.summary}>
                <div className={s.summaryName}>{validado.nombre}</div>
                <div className={s.summaryEmail}>{validado.correo}</div>
                {validado.validadoEn && <div className={s.summaryDate}>{fechaCorta(validado.validadoEn)}</div>}
              </div>
              <div className={s.grow} />
              <button type="button" className="btn btn-soft" style={{ marginTop: 22 }} onClick={reiniciar}>Volver al inicio</button>
            </>
          )}
        </section>
      </main>

      <footer className={s.footer}>
        Fundación ROFÉ · Jóvenes creaTIvos · <a href={privacyUrl} target="_blank" rel="noreferrer">Política de privacidad</a>
      </footer>
    </div>
  );
}
