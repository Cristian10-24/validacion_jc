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

## Roles

| Rol | Puede |
|---|---|
| **monitor** | Solo sus ciudades: aprobar, corregir nombre y correo, validar por el estudiante |
| **coordinador** | Todas las ciudades: lo mismo que un monitor + Resumen, historial y Excel final |
| **admin** | Todo lo del coordinador + subir la lista, gestionar usuarios y editar cualquier campo de un estudiante (incluido el documento) |

Los permisos están en `src/lib/permisos.ts` y se validan en el servidor (`exigir()` en cada ruta). `npm test` incluye pruebas de que coordinador y monitor reciben 403 en lo que no les corresponde.

## Coordinación y administración desde la web

- **`/admin`**: avance total y por ciudad, y botón para descargar el Excel final (Nombre completo, Correo, Ciudad; solo validados).
- **`/monitor`**: la lista de todos los estudiantes, con el **historial** de cambios de cada uno.
- **`/admin/usuarios`** (solo admin): crear, editar rol y ciudades, activar/desactivar y restablecer o asignar la clave (se muestra una sola vez; al cambiarla se cierran las sesiones abiertas de ese usuario).
- **Descargar pendientes** (solo admin, en Estudiantes): Excel con Nombre completo, Correo, Documento y Ciudad de los pendientes; si hay una ciudad filtrada, solo esa.
- **Editar datos** (solo admin, menú ⋯ en Estudiantes): documento, nombre, correo, ciudad, grupo y estado, aunque ya esté validado. Queda en el historial.
- **`/admin/importar`** (solo admin): subir la lista actualizada. Muestra una vista previa (nuevos, con datos cambiados, protegidos, los que ya no están y errores por fila) y solo guarda al confirmar. Nunca modifica a quien ya validó o envió una corrección; los que ya no están solo se eliminan si se marcan.

## Operación (scripts)

Usan la base de datos configurada en `.env.local`. Para operar sobre producción, pon ahí la cadena de Atlas de producción.

| Comando | Qué hace |
|---|---|
| `npm run import -- archivo.xlsx --dry-run` | Simula la importación (misma lógica que la página "Subir lista") |
| `npm run import -- archivo.xlsx` | Crea los nuevos y actualiza los pendientes. Nunca toca validados ni corregidos |
| `npm run import -- archivo.xlsx --eliminar-ausentes` | Además elimina a quienes ya no están en el archivo |
| `npm run monitor:add -- usuario "Nombre" "Ciudad1,Ciudad2" [--clave=CLAVE]` | Crea o actualiza un monitor |
| `npm run monitor:add -- usuario "Nombre" --rol=coordinador` | Crea o actualiza un coordinador (sin ciudad) |
| `npm run monitor:add -- usuario "Nombre" --rol=admin` | Crea o actualiza un administrador (sin ciudad) |
| (cualquiera de los anteriores) `--nueva-clave` | En un usuario existente, genera una clave nueva |
| `npm run monitor:list` | Lista los usuarios |
| `npm run export` | Genera el Excel final en `exports/` |
| `npm run cities:fix` | Vuelve a normalizar las ciudades guardadas |
| `npm run reset-estudiantes -- --buscar` | Lista a quienes tocó el rol estudiante (solo lectura) |
| `npm run reset-estudiantes -- doc1 doc2 [--dry-run]` | Deja esos estudiantes como recién importados y borra su historial (salvo la importación) |

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
