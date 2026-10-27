/**
 * Testimonios · Jóvenes creaTIvos — Apps Script de la hoja de respuestas del Google Form.
 *
 * Envía cada respuesta del formulario a la app (webhook). NO lo actives hasta que se apruebe
 * subir el módulo a producción. Instalación paso a paso: docs/testimonios/INSTALACION.md
 *
 * Configuración (Extensiones → Apps Script → Configuración del proyecto → Propiedades del script):
 *   TESTIMONIOS_URL      https://validacion.tocaunavida.org/api/testimonios/webhook
 *   TESTIMONIOS_SECRETO  (el mismo valor de TESTIMONIOS_WEBHOOK_SECRET en Vercel)
 *
 * Funciones:
 *   alEnviarFormulario(e)  → activador "Al enviar el formulario" (desde la hoja de cálculo)
 *   cargaInicial()         → envía TODAS las respuestas existentes una vez (seguro repetirla: no duplica)
 *   reintentarPendientes() → reenvía las filas que fallaron (programable cada 10 minutos)
 *   probarConexion()       → comprueba URL y secreto sin enviar respuestas
 */

var LOTE = 50;              // filas por envío en la carga inicial
var INTENTOS = 3;           // reintentos por envío
var CLAVE_COLA = "TESTIMONIOS_PENDIENTES";

function config_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty("TESTIMONIOS_URL");
  var secreto = p.getProperty("TESTIMONIOS_SECRETO");
  if (!url || !secreto) throw new Error("Faltan las propiedades TESTIMONIOS_URL y TESTIMONIOS_SECRETO.");
  return { url: url, secreto: secreto };
}

/** Hoja donde llegan las respuestas del formulario (la primera vinculada al Form). */
function hoja_() {
  var libro = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = libro.getSheets();
  for (var i = 0; i < hojas.length; i++) if (hojas[i].getFormUrl()) return hojas[i];
  return hojas[0];
}

/** Una fila como { encabezado: valor visible }. Se usan valores visibles para que la marca temporal sea siempre igual. */
function filaComoObjeto_(sheet, fila, encabezados) {
  var valores = sheet.getRange(fila, 1, 1, encabezados.length).getDisplayValues()[0];
  var obj = {};
  for (var c = 0; c < encabezados.length; c++) if (encabezados[c]) obj[encabezados[c]] = valores[c];
  return { fila: fila, respuesta: obj };
}

function encabezados_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
}

/** POST con reintentos (espera 1 s, 2 s, 4 s). Devuelve true si la app respondió 200. No reintenta un 401/400. */
function enviar_(cuerpo) {
  var cfg = config_();
  var opciones = {
    method: "post",
    contentType: "application/json",
    headers: { "X-Testimonios-Secret": cfg.secreto },
    payload: JSON.stringify(cuerpo),
    muteHttpExceptions: true,
  };
  for (var i = 0; i < INTENTOS; i++) {
    try {
      var r = UrlFetchApp.fetch(cfg.url, opciones);
      var code = r.getResponseCode();
      if (code === 200) return true;
      if (code === 400 || code === 401 || code === 413) { console.error("Rechazado (" + code + "): " + r.getContentText()); return false; }
      console.warn("Intento " + (i + 1) + " falló con código " + code);
    } catch (err) {
      console.warn("Intento " + (i + 1) + " sin respuesta: " + err);
    }
    Utilities.sleep(1000 * Math.pow(2, i));
  }
  return false;
}

// ---------- Cola de pendientes (filas que no se pudieron enviar) ----------

function encolar_(filas) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var p = PropertiesService.getScriptProperties();
    var cola = JSON.parse(p.getProperty(CLAVE_COLA) || "[]");
    filas.forEach(function (f) { if (cola.indexOf(f) < 0) cola.push(f); });
    p.setProperty(CLAVE_COLA, JSON.stringify(cola));
  } finally { lock.releaseLock(); }
}

function reintentarPendientes() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var cola;
  try {
    cola = JSON.parse(PropertiesService.getScriptProperties().getProperty(CLAVE_COLA) || "[]");
    PropertiesService.getScriptProperties().setProperty(CLAVE_COLA, "[]");
  } finally { lock.releaseLock(); }
  if (!cola.length) { console.log("No hay pendientes."); return; }

  var sheet = hoja_(), enc = encabezados_(sheet), fallidas = [];
  for (var i = 0; i < cola.length; i += LOTE) {
    var lote = cola.slice(i, i + LOTE);
    if (!enviar_({ respuestas: lote.map(function (f) { return filaComoObjeto_(sheet, f, enc); }) })) fallidas = fallidas.concat(lote);
  }
  if (fallidas.length) encolar_(fallidas);
  console.log("Reintento: " + (cola.length - fallidas.length) + " enviadas, " + fallidas.length + " siguen pendientes.");
}

// ---------- Activador y carga inicial ----------

/** Activador "Al enviar el formulario" (de la hoja de cálculo). */
function alEnviarFormulario(e) {
  var sheet = e && e.range ? e.range.getSheet() : hoja_();
  var fila = e && e.range ? e.range.getRow() : sheet.getLastRow();
  var item = filaComoObjeto_(sheet, fila, encabezados_(sheet));
  if (!enviar_(item)) encolar_([fila]);
}

/** Envía todas las respuestas existentes. Se puede repetir: la app no duplica respuestas. */
function cargaInicial() {
  var sheet = hoja_(), enc = encabezados_(sheet), ultima = sheet.getLastRow();
  if (ultima < 2) { console.log("No hay respuestas."); return; }
  var enviadas = 0, fallidas = [];
  for (var desde = 2; desde <= ultima; desde += LOTE) {
    var filas = [];
    for (var f = desde; f < Math.min(desde + LOTE, ultima + 1); f++) filas.push(f);
    if (enviar_({ respuestas: filas.map(function (n) { return filaComoObjeto_(sheet, n, enc); }) })) enviadas += filas.length;
    else fallidas = fallidas.concat(filas);
  }
  if (fallidas.length) encolar_(fallidas);
  console.log("Carga inicial: " + enviadas + " filas enviadas, " + fallidas.length + " quedaron pendientes (usa reintentarPendientes).");
}

/** Comprueba URL y secreto: la app responde 400 (cuerpo vacío) si el secreto es correcto, 401 si no. */
function probarConexion() {
  var cfg = config_();
  var r = UrlFetchApp.fetch(cfg.url, { method: "post", contentType: "application/json", headers: { "X-Testimonios-Secret": cfg.secreto }, payload: "{}", muteHttpExceptions: true });
  var code = r.getResponseCode();
  console.log(code === 400 ? "Conexión correcta (secreto aceptado)." : code === 401 ? "Secreto incorrecto." : code === 503 ? "La app no tiene configurado TESTIMONIOS_WEBHOOK_SECRET." : "Respuesta inesperada: " + code);
}
