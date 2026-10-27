# Testimonios · Instalar el Apps Script en la hoja de respuestas

> **No lo actives todavía.** Este paso se hace solo cuando se apruebe subir el módulo de testimonios a producción.
> Antes de esto, la app en producción debe tener configurada la variable `TESTIMONIOS_WEBHOOK_SECRET` (ver [PRODUCCION.md](PRODUCCION.md), pasos 1 a 3; esta guía es su paso 6).

El script envía cada respuesta del Google Form a la app. Si la app no responde, reintenta tres veces y, si sigue fallando, deja la fila en una cola para reenviarla después. Enviar la misma respuesta dos veces no la duplica.

## 1. Generar el secreto (una sola vez)

En cualquier computador con Node instalado:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Guarda ese valor: va **igual** en Vercel (`TESTIMONIOS_WEBHOOK_SECRET`) y en el script (`TESTIMONIOS_SECRETO`). No lo pegues en el código, en un correo ni en un chat.

## 2. Pegar el código

1. Abre la **hoja de cálculo** donde llegan las respuestas del Form (no el Form).
2. Ve a **Extensiones → Apps Script**.
3. Borra lo que haya en `Código.gs` y pega todo el contenido de [`apps-script.gs`](apps-script.gs).
4. Ponle un nombre al proyecto (por ejemplo "Testimonios → app") y pulsa **Guardar**.

## 3. Configurar la dirección y el secreto

1. En el editor de Apps Script, ve a **⚙ Configuración del proyecto → Propiedades del script → Agregar propiedad de script**.
2. Agrega:

| Propiedad | Valor |
|---|---|
| `TESTIMONIOS_URL` | `https://validacion.tocaunavida.org/api/testimonios/webhook` |
| `TESTIMONIOS_SECRETO` | el secreto del paso 1 |
| `HOJA_RESPUESTAS` | el nombre **exacto** de la pestaña de respuestas (p. ej. `Testimonio-2026`) |

3. Pulsa **Guardar propiedades del script**.

El script solo lee la pestaña `HOJA_RESPUESTAS`; si no la encuentra, se detiene con un mensaje. Nunca usa la hoja activa ni la primera, e ignora los envíos de otros formularios conectados al mismo archivo.

## 4. Probar la conexión (no envía respuestas)

1. En el editor, elige la función **`probarConexion`** y pulsa **▶ Ejecutar**.
2. La primera vez Google pide permisos ("Ver y administrar hojas de cálculo" y "Conectarse a un servicio externo"). Acéptalos con la cuenta dueña de la hoja.
3. En el **Registro de ejecución** debe salir la pestaña con sus filas y las 7 columnas encontradas, y luego **"Conexión correcta (secreto aceptado)"**.
   - "No existe la pestaña…" o "No encuentro la columna…": revisa `HOJA_RESPUESTAS` y los encabezados.
   - "Secreto incorrecto": el valor no coincide con el de Vercel.
   - "La app no tiene configurado…": falta la variable en Vercel o no se volvió a desplegar.

## 5. Carga inicial (una sola vez)

1. Elige la función **`cargaInicial`** y pulsa **▶ Ejecutar**.
2. El registro mostrará cuántas filas se enviaron. Si alguna quedó pendiente, ejecuta **`reintentarPendientes`**.

Repetir la carga inicial no duplica nada: la app reconoce cada respuesta por su contenido.

## 6. Activar el envío automático

1. En el editor, ve a **⏰ Activadores → + Agregar activador**:
   - Función: **`alEnviarFormulario`**
   - Fuente del evento: **De una hoja de cálculo**
   - Tipo de evento: **Al enviar el formulario**
2. Guarda.

Opcional (recomendado), para reenviar solas las filas que hayan fallado:
- **+ Agregar activador**: función **`reintentarPendientes`**, fuente **Según tiempo**, tipo **Temporizador de minutos**, **Cada 10 minutos**.

## 7. Comprobar

1. Envía una respuesta de prueba en el Form con un documento que esté en la lista de participantes.
2. En la app, en **Testimonios**, ese participante debe quedar **Realizado** con su enlace.
3. Una respuesta cuyo documento, correo y celular no estén en la lista aparece en **Sin dueño** (solo admin).

## Columnas que envía el script

`Marca temporal` · `Nombre Completo` · `Número de documento` · `Correo` · `Ciudad a la que perteneces` · `¡Sube aquí tu testimonio!` · `Número de WhatsApp o Celular`

- El script busca cada columna por la **primera línea** de su encabezado (sin importar tildes ni mayúsculas), en cualquier orden. Así reconoce la del video aunque su encabezado tenga varias líneas de instrucciones.
- Envía **solo esas 7 columnas**, con esos nombres. Cualquier otra columna de la pestaña (o que se agregue después) no sale de la hoja.
- Si falta una de las 7 o un encabezado está repetido, se detiene con un mensaje.
- Si el enlace trae varios videos separados por comas, se guardan todos. Las respuestas anteriores a la pregunta del celular (celda vacía) se aceptan y cruzan por documento o correo.

## Si algo falla

- **Ver errores:** en Apps Script, **Ejecuciones** muestra cada envío y su resultado.
- **Desactivar el envío:** en **Activadores**, elimina `alEnviarFormulario`. Las respuestas siguen llegando a la hoja; luego se pueden reenviar con `cargaInicial` sin duplicar.
- **Cambiar el secreto:** genera uno nuevo, cámbialo en Vercel (y vuelve a desplegar) y en la propiedad `TESTIMONIOS_SECRETO`.
