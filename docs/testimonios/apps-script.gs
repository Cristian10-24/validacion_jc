/**
 * Testimonios · Jóvenes creaTIvos — Apps Script de la hoja de respuestas del Google Form.
 *
 * Envía cada respuesta del formulario a la app (webhook). Instalación paso a paso: docs/testimonios/INSTALACION.md
 *
 * Configuración (Extensiones → Apps Script → Configuración del proyecto → Propiedades del script):
 *   TESTIMONIOS_URL      https://validacion.tocaunavida.org/api/testimonios/webhook
 *   TESTIMONIOS_SECRETO  (el mismo valor de TESTIMONIOS_WEBHOOK_SECRET en Vercel)
 *   HOJA_RESPUESTAS      nombre EXACTO de la pestaña de respuestas (p. ej. Testimonio-2026)
 *
 * Solo lee la pestaña HOJA_RESPUESTAS (por nombre exacto; nunca la hoja activa ni la primera) y solo envía
 * sus 7 columnas del formulario, con nombres fijos. Cualquier otra columna o pestaña se ignora.
 *
 * Funciones:
 *   alEnviarFormulario(e)  → activador "Al enviar el formulario" (ignora envíos de otras pestañas)
 *   cargaInicial()         → envía TODAS las respuestas existentes una vez (seguro repetirla: no duplica)
 *   reintentarPendientes() → reenvía las filas que fallaron (programable cada 10 minutos)
 *   probarConexion()       → comprueba URL, secreto y columnas sin enviar respuestas
 */

var LOTE = 50;              // filas por envío en la carga inicial
var INTENTOS = 3;           // reintentos por envío
var CLAVE_COLA = "TESTIMONIOS_PENDIENTES";

/**
 * Columnas que se envían. "nombre" es como se envía a la app; "encabezado" es el texto de la primera línea del
 * encabezado en la hoja (se compara sin tildes, mayúsculas ni signos). Ninguna otra columna sale de la hoja.
 */
var COLUMNAS = [
  { nombre: "Marca temporal", encabezado: "Marca temporal", obligatoria: true },
  { nombre: "Nombre Completo", encabezado: "Nombre Completo", obligatoria: true },
  { nombre: "Número de documento", encabezado: "Número de documento", obligatoria: true },
  { nombre: "Correo", encabezado: "Correo", obligatoria: true },
  { nombre: "Ciudad a la que perteneces", encabezado: "Ciudad a la que perteneces", obligatoria: true },
  { nombre: "¡Sube aquí tu testimonio!", encabezado: "¡Sube aquí tu testimonio!", obligatoria: true },
  { nombre: "Número de WhatsApp o Celular", encabezado: "Número de WhatsApp o Celular", obligatoria: true },
];

function config_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty("TESTIMONIOS_URL");
  var secreto = p.getProperty("TESTIMONIOS_SECRETO");
  var hoja = p.getProperty("HOJA_RESPUESTAS");
  if (!url || !secreto || !hoja) throw new Error("Faltan propiedades del script: TESTIMONIOS_URL, TESTIMONIOS_SECRETO y HOJA_RESPUESTAS.");
  return { url: url, secreto: secreto, hoja: hoja };
}

/** La pestaña de respuestas, por nombre exacto. Si no existe, se detiene con un mensaje claro. */
function hoja_() {
  var nombre = config_().hoja;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
  if (!sheet) throw new Error('No existe la pestaña "' + nombre + '". Revisa la propiedad HOJA_RESPUESTAS (debe ser el nombre exacto).');
  return sheet;
}

/** Primera línea del encabezado, sin tildes, mayúsculas ni signos: "¡Sube aquí tu testimonio!\n(…)" → "sube aqui tu testimonio". */
function normalizar_(texto) {
  return String(texto).split(/\r?\n/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Posición (base 0) de cada una de las 7 columnas. Falla si falta una o si un encabezado está repetido. */
function columnas_(sheet) {
  var enc = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizar_);
  return COLUMNAS.map(function (c) {
    var buscado = normalizar_(c.encabezado), pos = [];
    enc.forEach(function (e, i) { if (e === buscado) pos.push(i); });
    if (pos.length > 1) throw new Error('El encabezado "' + c.encabezado + '" está repetido en la pestaña ' + sheet.getName() + ".");
    if (!pos.length && c.obligatoria) throw new Error('No encuentro la columna "' + c.encabezado + '" en la pestaña ' + sheet.getName() + ".");
    return { nombre: c.nombre, indice: pos.length ? pos[0] : -1 };
  });
}

/** Una fila como { fila, respuesta } con SOLO las 7 columnas. Valores visibles: la marca temporal siempre igual. */
function itemDeValores_(valores, fila, cols) {
  var obj = {};
  cols.forEach(function (c) { obj[c.nombre] = c.indice >= 0 ? valores[c.indice] : ""; });
  return { fila: fila, respuesta: obj };
}

/** Filas [desde, hasta] como items, leyendo la hoja una sola vez. Se saltan las filas sin marca temporal. */
function items_(sheet, cols, desde, hasta) {
  var valores = sheet.getRange(desde, 1, hasta - desde + 1, sheet.getLastColumn()).getDisplayValues();
  var out = [];
  for (var i = 0; i < valores.length; i++) {
    var it = itemDeValores_(valores[i], desde + i, cols);
    if (String(it.respuesta["Marca temporal"]).trim()) out.push(it);
  }
  return out;
}

/** POST con reintentos (espera 1 s, 2 s, 4 s). Devuelve true si la app respondió 200. No reintenta un 400/401/413. */
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
      if (code === 200) {
        var d = JSON.parse(r.getContentText());
        if (d.invalidas) console.warn(d.invalidas + " respuesta(s) inválida(s): " + JSON.stringify(d.resultados.filter(function (x) { return x.estado === "invalida"; })));
        return true;
      }
      if (code === 400 || code === 401 || code === 413) { console.error("Rechazado (" + code + "): " + r.getContentText()); return false; }
      console.warn("Intento " + (i + 1) + " falló con código " + code);
    } catch (err) {
      console.warn("Intento " + (i + 1) + " sin respuesta: " + err);
    }
    Utilities.sleep(1000 * Math.pow(2, i));
  }
  return false;
}

// ---------- Cola de pendientes (números de fila que no se pudieron enviar) ----------

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

  var sheet = hoja_(), cols = columnas_(sheet), fallidas = [];
  for (var i = 0; i < cola.length; i += LOTE) {
    var lote = cola.slice(i, i + LOTE);
    var items = [];
    lote.forEach(function (f) { items = items.concat(items_(sheet, cols, f, f)); });
    if (items.length && !enviar_({ respuestas: items })) fallidas = fallidas.concat(lote);
  }
  if (fallidas.length) encolar_(fallidas);
  console.log("Reintento: " + (cola.length - fallidas.length) + " enviadas, " + fallidas.length + " siguen pendientes.");
}

// ---------- Activador y carga inicial ----------

/** Activador "Al enviar el formulario". Ignora los envíos de cualquier otra pestaña (otros formularios del archivo). */
function alEnviarFormulario(e) {
  if (!e || !e.range) { console.log("Sin datos del envío: esta función la ejecuta el activador, no a mano."); return; }
  var sheet = e.range.getSheet(), esperada = config_().hoja;
  if (sheet.getName() !== esperada) { console.log('Envío de la pestaña "' + sheet.getName() + '": se ignora (solo ' + esperada + ")."); return; }
  var fila = e.range.getRow();
  var items = items_(sheet, columnas_(sheet), fila, fila);
  if (items.length && !enviar_(items[0])) encolar_([fila]);
}

/** Envía todas las respuestas existentes. Se puede repetir: la app no duplica respuestas. */
function cargaInicial() {
  var sheet = hoja_(), cols = columnas_(sheet), ultima = sheet.getLastRow();
  if (ultima < 2) { console.log("No hay respuestas en " + sheet.getName() + "."); return; }
  var enviadas = 0, fallidas = [];
  for (var desde = 2; desde <= ultima; desde += LOTE) {
    var hasta = Math.min(desde + LOTE - 1, ultima);
    var items = items_(sheet, cols, desde, hasta);
    if (!items.length) continue;
    if (enviar_({ respuestas: items })) enviadas += items.length;
    else fallidas = fallidas.concat(items.map(function (it) { return it.fila; }));
  }
  if (fallidas.length) encolar_(fallidas);
  console.log("Carga inicial (" + sheet.getName() + "): " + enviadas + " respuestas enviadas, " + fallidas.length + " quedaron pendientes (usa reintentarPendientes).");
}

/** Comprueba la pestaña, las 7 columnas, la URL y el secreto. No envía respuestas (la app responde 400 a un cuerpo vacío). */
function probarConexion() {
  var cfg = config_(), sheet = hoja_(), cols = columnas_(sheet);
  console.log('Pestaña "' + sheet.getName() + '" encontrada: ' + (sheet.getLastRow() - 1) + " filas de respuestas. Columnas: "
    + cols.map(function (c) { return c.nombre + (c.indice >= 0 ? " (col. " + (c.indice + 1) + ")" : " (no está)"); }).join(", ") + ".");
  var r = UrlFetchApp.fetch(cfg.url, { method: "post", contentType: "application/json", headers: { "X-Testimonios-Secret": cfg.secreto }, payload: "{}", muteHttpExceptions: true });
  var code = r.getResponseCode();
  console.log(code === 400 ? "Conexión correcta (secreto aceptado)." : code === 401 ? "Secreto incorrecto." : code === 503 ? "La app no tiene configurado TESTIMONIOS_WEBHOOK_SECRET." : "Respuesta inesperada: " + code);
}
