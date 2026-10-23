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

## Operación (scripts)

Usan la base de datos configurada en `.env.local`. Para operar sobre producción, pon ahí la cadena de Atlas de producción.

| Comando | Qué hace |
|---|---|
| `npm run import -- archivo.xlsx --dry-run` | Simula la importación y muestra errores, avisos y las ciudades detectadas |
| `npm run import -- archivo.xlsx` | Importa: crea estudiantes nuevos y actualiza los pendientes. Nunca pisa los validados |
| `npm run monitor:add -- usuario "Nombre" "Ciudad1,Ciudad2"` | Crea un monitor (o le genera una clave nueva) e imprime la clave |
| `npm run monitor:add -- coordinacion "Nombre" --admin` | Crea una cuenta admin (ve todas las ciudades) |
| `npm run monitor:list` | Lista los monitores |
| `npm run export` | Genera el Excel final en `exports/` |

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

## Cerrar la vista de estudiantes

En Vercel, cambia `STUDENT_PORTAL_ENABLED` a `false` y vuelve a desplegar (Deployments → Redeploy). El panel de monitores sigue funcionando.
