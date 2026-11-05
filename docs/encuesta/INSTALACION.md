# Encuesta final · instalación

El módulo "Encuesta final" usa la **misma lista de participantes** que testimonios (`testimonios_participantes`, solo lectura)
y guarda sus datos en colecciones propias: `encuesta_respuestas` y `encuesta_comentarios`.
Las respuestas llegan desde la pestaña de "Encuesta-Final-2026" del mismo Google Sheets que usa testimonios,
a un endpoint propio: `POST /api/encuesta/webhook`.

## 1. Vercel: secreto del webhook

1. Genera un secreto largo (mínimo 24 caracteres), por ejemplo en PowerShell:
   `[Convert]::ToBase64String((1..36 | ForEach-Object { Get-Random -Max 256 }))`
2. Vercel → proyecto → Settings → Environment Variables → agrega `ENCUESTA_WEBHOOK_SECRET` con ese valor (Production).
   Debe ser **distinto** de `TESTIMONIOS_WEBHOOK_SECRET`.
3. Vuelve a desplegar (Redeploy) para que la app lo lea. Sin esta variable el webhook responde 503 y no guarda nada.

## 2. Apps Script: pegar el archivo nuevo (sin tocar el de testimonios)

1. Abre el Google Sheets → Extensiones → Apps Script (es el mismo proyecto donde está el script de testimonios).
2. Antes de nada, revisa que el archivo de testimonios sea la versión actual de `docs/testimonios/apps-script.gs`:
   su función `alEnviarFormulario` debe tener la línea `if (sheet.getName() !== esperada)`. Esa línea hace que
   testimonios ignore los envíos de la encuesta. Si no la tiene, pega la versión del repositorio.
3. En el panel "Archivos", **+ → Secuencia de comandos**, nómbralo `encuesta` y pega TODO el contenido de
   `docs/encuesta/apps-script.gs`. Guarda. No edites ni borres el archivo de testimonios.

## 3. Propiedades del script

Configuración del proyecto (engranaje) → Propiedades del script → **Agregar propiedad** (las de testimonios se quedan igual):

| Propiedad          | Valor                                                     |
|--------------------|-----------------------------------------------------------|
| `ENCUESTA_URL`     | `https://validacion.tocaunavida.org/api/encuesta/webhook` |
| `ENCUESTA_SECRETO` | el mismo valor de `ENCUESTA_WEBHOOK_SECRET` en Vercel     |
| `HOJA_ENCUESTA`    | nombre EXACTO de la pestaña (p. ej. `Encuesta-Final-2026`) |

## 4. Probar la conexión

En el editor, elige `encuestaProbarConexion` y pulsa Ejecutar. En el registro debe decir
"Pestaña … encontrada" con las 5 columnas y "Conexión correcta (secreto aceptado)".

## 5. Activador

Activadores (reloj) → **Agregar activador**:
- Función: `encuestaAlEnviarFormulario`
- Fuente del evento: De la hoja de cálculo
- Tipo de evento: Al enviar el formulario

Deja el activador de testimonios (`alEnviarFormulario`) como está. Cada envío dispara los dos activadores y cada uno
solo procesa su pestaña: testimonios ignora la encuesta y la encuesta ignora testimonios.

Opcional: un activador de tiempo cada 10 minutos para `encuestaReintentarPendientes`.

## 6. Carga de las respuestas que ya existen

Cuando los pasos 1–5 estén listos y la conexión dé "correcta", ejecuta **una vez** `encuestaCargaInicial`.
Se puede repetir sin miedo: la app no duplica respuestas. Si quedan filas pendientes, ejecuta `encuestaReintentarPendientes`.

## Cómo se cruzan las respuestas

- Primero por número de documento (sin puntos, guiones ni espacios; conserva ceros a la izquierda).
- Si el documento no coincide con nadie, por correo, solo si ese correo es de un único participante.
- Si alguien respondió varias veces, cuenta la respuesta más reciente.
- Las que no coinciden aparecen para la administración en "Encuesta sin coincidencia".
- El cruce se calcula al consultar: si se corrige la lista de participantes, las respuestas se vuelven a cruzar solas.
