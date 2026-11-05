/**
 * Encuesta final · Jóvenes creaTIvos — Apps Script para la pestaña de respuestas de "Encuesta-Final-2026".
 *
 * Se pega como un ARCHIVO NUEVO (p. ej. "encuesta.gs") dentro del MISMO proyecto de Apps Script donde ya está el de
 * testimonios. No reemplaza ni modifica el archivo de testimonios. Guía paso a paso: docs/encuesta/INSTALACION.md
 *
 * Por qué todo lleva el prefijo "encuesta": en Apps Script todos los archivos de un proyecto comparten las mismas
 * funciones y variables globales. Si este archivo usara nombres como cargaInicial, config_ o COLUMNAS, pisaría
 * los de testimonios. Por eso aquí solo hay 4 funciones globales (todas empiezan por "encuesta") y una variable
 * (ENCUESTA_); el resto vive dentro de ENCUESTA_. Las propiedades del script también son propias (ENCUESTA_*, HOJA_ENCUESTA).
 *
 * Propiedades del script (Configuración del proyecto → Propiedades del script):
 *   ENCUESTA_URL      https://validacion.tocaunavida.org/api/encuesta/webhook
 *   ENCUESTA_SECRETO  (el mismo valor de ENCUESTA_WEBHOOK_SECRET en Vercel; distinto del de testimonios)
 *   HOJA_ENCUESTA     nombre EXACTO de la pestaña de respuestas de la encuesta (p. ej. Encuesta-Final-2026)
 *
 * Solo lee la pestaña HOJA_ENCUESTA (por nombre exacto) y solo envía sus 5 primeras columnas del formulario
 * (Marca temporal, Correo electrónico, Nombre completo, Número de documento de identidad, Ciudad). Lo demás se ignora.
 *
 * Funciones:
 *   encuestaAlEnviarFormulario(e)  → activador "Al enviar el formulario" (ignora los envíos de otras pestañas, p. ej. testimonios)
 *   encuestaCargaInicial()         → envía TODAS las respuestas existentes de la pestaña (seguro repetirla: no duplica)
 *   encuestaReintentarPendientes() → reenvía las filas que fallaron (programable cada 10 minutos)
 *   encuestaProbarConexion()       → comprueba pestaña, columnas, URL y secreto sin enviar respuestas
 */

var ENCUESTA_ = (function () {
  var LOTE = 50;      // filas por envío en la carga inicial
  var INTENTOS = 3;   // reintentos por envío
  var CLAVE_COLA = "ENCUESTA_PENDIENTES";

  /** "nombre": como se envía a la app; "encabezado": primera línea del encabezado en la hoja (sin tildes, mayúsculas ni signos). */
  var COLUMNAS = [
    { nombre: "Marca temporal", encabezado: "Marca temporal" },
    { nombre: "Correo electrónico", encabezado: "Correo electrónico" },
    { nombre: "Nombre completo", encabezado: "Nombre completo" },
    { nombre: "Número de documento de identidad", encabezado: "Número de documento de identidad" },
    { nombre: "A qué ciudad pertenece tu grupo?", encabezado: "A qué ciudad pertenece tu grupo?" },
  ];

  function config() {
    var p = PropertiesService.getScriptProperties();
    var url = p.getProperty("ENCUESTA_URL"), secreto = p.getProperty("ENCUESTA_SECRETO"), hoja = p.getProperty("HOJA_ENCUESTA");
    if (!url || !secreto || !hoja) throw new Error("Faltan propiedades del script: ENCUESTA_URL, ENCUESTA_SECRETO y HOJA_ENCUESTA.");
    return { url: url, secreto: secreto, hoja: hoja };
  }

  function hoja() {
    var nombre = config().hoja;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
    if (!sheet) throw new Error('No existe la pestaña "' + nombre + '". Revisa la propiedad HOJA_ENCUESTA (debe ser el nombre exacto).');
    return sheet;
  }

  function normalizar(texto) {
    return String(texto).split(/\r?\n/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  /** Posición (base 0) de cada columna. Falla si falta una o si un encabezado está repetido. */
  function columnas(sheet) {
    var enc = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].map(normalizar);
    return COLUMNAS.map(function (c) {
      var buscado = normalizar(c.encabezado), pos = [];
      enc.forEach(function (e, i) { if (e === buscado) pos.push(i); });
      if (pos.length > 1) throw new Error('El encabezado "' + c.encabezado + '" está repetido en la pestaña ' + sheet.getName() + ".");
      if (!pos.length) throw new Error('No encuentro la columna "' + c.encabezado + '" en la pestaña ' + sheet.getName() + ".");
      return { nombre: c.nombre, indice: pos[0] };
    });
  }

  /** Filas [desde, hasta] como { fila, respuesta } con SOLO las 5 columnas. Se saltan las filas sin marca temporal. */
  function items(sheet, cols, desde, hasta) {
    var valores = sheet.getRange(desde, 1, hasta - desde + 1, sheet.getLastColumn()).getDisplayValues();
    var out = [];
    for (var i = 0; i < valores.length; i++) {
      var obj = {};
      cols.forEach(function (c) { obj[c.nombre] = valores[i][c.indice]; });
      if (String(obj["Marca temporal"]).trim()) out.push({ fila: desde + i, respuesta: obj });
    }
    return out;
  }

  /** POST con reintentos (1 s, 2 s, 4 s). true si la app respondió 200. No reintenta un 400/401/413. */
  function enviar(cuerpo) {
    var cfg = config();
    var opciones = {
      method: "post", contentType: "application/json", headers: { "X-Encuesta-Secret": cfg.secreto },
      payload: JSON.stringify(cuerpo), muteHttpExceptions: true,
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

  function encolar(filas) {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var p = PropertiesService.getScriptProperties();
      var cola = JSON.parse(p.getProperty(CLAVE_COLA) || "[]");
      filas.forEach(function (f) { if (cola.indexOf(f) < 0) cola.push(f); });
      p.setProperty(CLAVE_COLA, JSON.stringify(cola));
    } finally { lock.releaseLock(); }
  }

  function alEnviar(e) {
    if (!e || !e.range) { console.log("Sin datos del envío: esta función la ejecuta el activador, no a mano."); return; }
    var sheet = e.range.getSheet(), esperada = config().hoja;
    if (sheet.getName() !== esperada) { console.log('Envío de la pestaña "' + sheet.getName() + '": se ignora (solo ' + esperada + ")."); return; }
    var fila = e.range.getRow();
    var its = items(sheet, columnas(sheet), fila, fila);
    if (its.length && !enviar(its[0])) encolar([fila]);
  }

  function cargaInicial() {
    var sheet = hoja(), cols = columnas(sheet), ultima = sheet.getLastRow();
    if (ultima < 2) { console.log("No hay respuestas en " + sheet.getName() + "."); return; }
    var enviadas = 0, fallidas = [];
    for (var desde = 2; desde <= ultima; desde += LOTE) {
      var lote = items(sheet, cols, desde, Math.min(desde + LOTE - 1, ultima));
      if (!lote.length) continue;
      if (enviar({ respuestas: lote })) enviadas += lote.length;
      else fallidas = fallidas.concat(lote.map(function (it) { return it.fila; }));
    }
    if (fallidas.length) encolar(fallidas);
    console.log("Carga inicial (" + sheet.getName() + "): " + enviadas + " respuestas enviadas, " + fallidas.length + " quedaron pendientes (usa encuestaReintentarPendientes).");
  }

  function reintentar() {
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    var cola;
    try {
      cola = JSON.parse(PropertiesService.getScriptProperties().getProperty(CLAVE_COLA) || "[]");
      PropertiesService.getScriptProperties().setProperty(CLAVE_COLA, "[]");
    } finally { lock.releaseLock(); }
    if (!cola.length) { console.log("No hay pendientes de la encuesta."); return; }

    var sheet = hoja(), cols = columnas(sheet), fallidas = [];
    for (var i = 0; i < cola.length; i += LOTE) {
      var filas = cola.slice(i, i + LOTE), lote = [];
      filas.forEach(function (f) { lote = lote.concat(items(sheet, cols, f, f)); });
      if (lote.length && !enviar({ respuestas: lote })) fallidas = fallidas.concat(filas);
    }
    if (fallidas.length) encolar(fallidas);
    console.log("Reintento encuesta: " + (cola.length - fallidas.length) + " enviadas, " + fallidas.length + " siguen pendientes.");
  }

  function probarConexion() {
    var cfg = config(), sheet = hoja(), cols = columnas(sheet);
    console.log('Pestaña "' + sheet.getName() + '" encontrada: ' + (sheet.getLastRow() - 1) + " filas de respuestas. Columnas: "
      + cols.map(function (c) { return c.nombre + " (col. " + (c.indice + 1) + ")"; }).join(", ") + ".");
    var r = UrlFetchApp.fetch(cfg.url, { method: "post", contentType: "application/json", headers: { "X-Encuesta-Secret": cfg.secreto }, payload: "{}", muteHttpExceptions: true });
    var code = r.getResponseCode();
    console.log(code === 400 ? "Conexión correcta (secreto aceptado)." : code === 401 ? "Secreto incorrecto." : code === 503 ? "La app no tiene configurado ENCUESTA_WEBHOOK_SECRET." : "Respuesta inesperada: " + code);
  }

  return { alEnviar: alEnviar, cargaInicial: cargaInicial, reintentar: reintentar, probarConexion: probarConexion };
})();

/** Activador "Al enviar el formulario". Ignora los envíos de cualquier otra pestaña (testimonios u otros formularios). */
function encuestaAlEnviarFormulario(e) { ENCUESTA_.alEnviar(e); }

/** Envía todas las respuestas existentes de la pestaña de la encuesta. Se puede repetir: la app no duplica. */
function encuestaCargaInicial() { ENCUESTA_.cargaInicial(); }

/** Reenvía las filas que no se pudieron enviar. */
function encuestaReintentarPendientes() { ENCUESTA_.reintentar(); }

/** Comprueba pestaña, columnas, URL y secreto. No envía respuestas (la app responde 400 a un cuerpo vacío). */
function encuestaProbarConexion() { ENCUESTA_.probarConexion(); }
