# Validación de datos · Jóvenes creaTIvos

App temporal para que los estudiantes confirmen su **nombre** y **correo personal** antes de generar los certificados.
Next.js (App Router) + MongoDB Atlas, desplegada en Vercel (`validacion.tocaunavida.org`). El plan completo está en [PLAN.md](PLAN.md).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y completa MONGODB_URI y SESSION_SECRET
npm run dev                  # http://localhost:3000
npm test                     # reglas de nombre y correo
```

## Coordinación desde la web (rol admin)

- **`/admin`**: avance total y por ciudad, y botón para descargar el Excel final (Nombre completo, Correo, Ciudad; solo validados).
- **`/monitor`**: la lista de todos los estudiantes, con el **historial** de cambios de cada uno.
- **`/admin/importar`**: subir la lista actualizada. Muestra una vista previa (nuevos, con datos cambiados, protegidos, los que ya no están y errores por fila) y solo guarda al confirmar. Nunca modifica a quien ya validó o envió una corrección; los que ya no están solo se eliminan si se marcan.

## Operación (scripts)

Usan la base de datos configurada en `.env.local`. Para operar sobre producción, pon ahí la cadena de Atlas de producción.

| Comando | Qué hace |
|---|---|
| `npm run import -- archivo.xlsx --dry-run` | Simula la importación (misma lógica que la página "Subir lista") |
| `npm run import -- archivo.xlsx` | Crea los nuevos y actualiza los pendientes. Nunca toca validados ni corregidos |
| `npm run import -- archivo.xlsx --eliminar-ausentes` | Además elimina a quienes ya no están en el archivo |
| `npm run monitor:add -- usuario "Nombre" "Ciudad1,Ciudad2" [--clave=CLAVE]` | Crea un monitor (o actualiza el existente) |
| `npm run monitor:add -- usuario "Nombre" --admin [--clave=CLAVE]` | Crea una cuenta de coordinación (ve todas las ciudades) |
| `npm run monitor:list` | Lista los usuarios |
| `npm run export` | Genera el Excel final en `exports/` |
| `npm run cities:fix` | Vuelve a normalizar las ciudades guardadas |

Columnas aceptadas en el Excel (primera hoja, primera fila = encabezados; no importan mayúsculas ni tildes):
`ciudad`, `grupo`, `documento`, `nombre` (o `nombres` + `apellidos`), `correo`, `monitor`.

Las ciudades de los monitores deben escribirse igual que en el Excel. El script de importación muestra cómo quedaron normalizadas.

## Variables de entorno

| Variable | Valor en producción |
|---|---|
| `MONGODB_URI` | Cadena `mongodb+srv://…` de Atlas |
| `MONGODB_DB` | `validacion_jc` (la app solo usa esta base) |
| `SESSION_SECRET` | 32+ caracteres aleatorios |
| `APP_URL` | `https://validacion.tocaunavida.org` (enlace del mensaje de WhatsApp) |
| `STUDENT_PORTAL_ENABLED` | `true` (o `false` para cerrar) |
| `NEXT_PUBLIC_PRIVACY_URL` | Enlace a la política de privacidad |
| `RATE_LIMIT_MAX` | Opcional. Intentos fallidos permitidos por IP cada 15 min (por defecto 20) |

## Límite de intentos

La búsqueda por documento y el login aceptan hasta `RATE_LIMIT_MAX` intentos **fallidos** por IP cada 15 minutos
(documento no encontrado, usuario o clave incorrectos). Las búsquedas exitosas no cuentan, para que un salón entero
detrás de la misma red pueda validar sin bloquearse. Los contadores se guardan en la colección `rateLimits` y MongoDB
los borra solo al terminar cada ventana.

## Cerrar la vista de estudiantes

En Vercel, cambia `STUDENT_PORTAL_ENABLED` a `false` y vuelve a desplegar (Deployments → Redeploy). El panel de monitores sigue funcionando.

## Despliegue

Vercel despliega desde el fork `Cristian10-24/validacion_jc`. El remoto `origin` tiene dos direcciones de push
(la organización y el fork), así que un solo `git push` actualiza ambos y dispara el despliegue.
