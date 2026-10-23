# PLAN.md — Validación de datos · Jóvenes creaTIvos (Fundación ROFÉ)

> Estado real del proyecto. Se actualiza con cada entrega.

## Contexto
Hay que validar el nombre completo y el correo personal de unos 700 estudiantes (9 ciudades, 9 monitores) antes de generar los certificados. Es una app temporal y mobile-first, publicada en **`https://validacion.tocaunavida.org`**.

**Decisiones cerradas**
- Los monitores se asignan **por ciudad** (un monitor puede tener varias). La coordinación (rol `admin`) ve todas.
- Partículas del nombre en minúscula (`de, del, la, las, los, y, e`). Nunca se agregan tildes automáticamente.
- Un correo repetido entre estudiantes **solo avisa** al monitor.
- El monitor puede **validar por el estudiante** con su declaración ("El estudiante confirmó que es su correo personal").
- Después de `validado`, solo un monitor o la coordinación puede corregir.
- El estudiante entra **solo con su número de documento** (sin fecha de nacimiento, sin CAPTCHA, sin código por correo).
- Enlace a la política de privacidad configurable (`NEXT_PUBLIC_PRIVACY_URL`).

**Riesgo aceptado:** quien adivine un documento puede ver y modificar el nombre y correo de ese estudiante. Mitigaciones: límite de intentos fallidos por IP, las correcciones quedan `corregido` hasta que el monitor las aprueba, historial completo de cambios y cierre del portal con una variable de entorno.

---

## 1. Arquitectura
Monolito **Next.js 16 (App Router) + TypeScript** en Vercel (runtime Node.js) con **MongoDB Atlas** (driver oficial `mongodb`, patrón `clientPromise` global). La app usa **solo la base `validacion_jc`**; el cluster tiene otras bases que no se tocan.

Dependencias: `next`, `react`, `mongodb`, `zod`, `bcryptjs`, `exceljs`; para desarrollo `tsx` y `vitest`. Estilos: CSS Modules + tokens tomados de los prototipos (`/prototipos/diseno`).

```
src/
├─ app/
│  ├─ page.tsx                    # Estudiante: buscar, revisar, corregir, guardar
│  ├─ cerrado/page.tsx            # Portal cerrado
│  ├─ login/                      # Login de monitores y coordinación
│  ├─ monitor/page.tsx            # Panel del monitor (filtros en la URL)
│  ├─ admin/page.tsx              # Coordinación: resumen por ciudad + Excel final
│  ├─ admin/importar/page.tsx     # Coordinación: subir lista con vista previa
│  └─ api/                        # ver sección 3
├─ components/                    # AppShell (marco común), StudentFlow, MonitorPanel, AdminOverview, ImportPanel
└─ lib/
   ├─ db.ts, types.ts, auth.ts    # conexión, tipos, sesión firmada + scopeFilter
   ├─ rateLimit.ts                # intentos fallidos por IP (MongoDB + TTL)
   ├─ importer.ts, excel.ts       # importación (web y script)
   ├─ export.ts                   # Excel final (web y script)
   ├─ history.ts, monitor-view.ts, student-view.ts, portal.ts
   └─ validation/                 # email.ts, name.ts
scripts/                          # import, export, monitor:add/list, cities:fix
tests/                            # vitest
```

## 2. Modelo de datos (base `validacion_jc`)
- **`students`**: `documento` (único), `ciudad`, `grupo`, `monitorRef`, `nombreOriginal`, `correoOriginal`, `nombre`, `correo`, `correoNorm`, `nombrePropuesto?`, `correoPropuesto?`, `estado` (`pendiente` | `corregido` | `validado`), `aceptaCorreoPersonal`, `validadoPor`, `validadoEn`, `actualizadoEn`. Índices: `documento` único, `{ciudad, estado}`, `correoNorm`.
- **`users`**: `usuario` (único), `nombre`, `passwordHash` (bcrypt), `rol` (`monitor` | `admin`), `ciudades[]`, `activo`.
- **`changeLog`**: `studentId`, `documento`, `campo`, `anterior`, `nuevo`, `actor {rol, usuario?}`, `accion` (`confirmar` | `corregir` | `aprobar` | `editar` | `validar_en_nombre` | `importar` | `eliminar`), `fecha`.
- **`rateLimits`**: contador por `tipo:ip:ventana`, con índice TTL (MongoDB lo borra al terminar la ventana).

**Semáforo:** verde = `validado` · amarillo = `corregido` (por revisar) · rojo = `pendiente`.

## 3. Rutas y API
| Ruta | Acceso | Qué hace |
|---|---|---|
| `POST /api/estudiante/buscar` | Público + límite por IP | Busca por documento |
| `POST /api/estudiante/guardar` | Público (exige id + documento) | Confirmar → `validado`; corregir → `corregido` |
| `POST /api/auth/login` · `logout` | Público + límite por IP | Cookie httpOnly firmada (7 días). Admin entra a `/admin`, monitor a `/monitor` |
| `GET /api/monitor/estudiantes` | Monitor (sus ciudades) / admin | Lista con avisos |
| `POST /api/monitor/estudiantes/[id]` | Monitor (su ciudad) / admin | Aprobar, editar, validar por el estudiante |
| `GET /api/monitor/estudiantes/[id]` | Solo admin | Historial de cambios del estudiante |
| `GET /api/admin/resumen` | Solo admin | Avance total y por ciudad (validados, corregidos, pendientes, monitores) |
| `GET /api/admin/exportar` | Solo admin | Excel final |
| `POST /api/admin/importar` | Solo admin | Vista previa o aplicación de una nueva lista |

Toda entrada se valida con Zod. `scopeFilter` limita en el servidor cada consulta del monitor a sus ciudades (otra ciudad → 404). Las mutaciones verifican el `Origin`.

## 4. Funcionalidades entregadas
**Estudiante:** busca por documento → revisa "Así aparecerá en tu certificado" → "Mis datos están bien" o "Corregir" (ayudas en vivo: correo educativo bloquea, dominio mal escrito sugiere) → casilla obligatoria "Confirmo que este es mi correo personal y lo seguiré usando" → éxito. Estados: no encontrado, ya validado, demasiados intentos, portal cerrado.

**Monitor:** login · semáforo y avance · filtros por estado y ciudad + búsqueda, **guardados en la URL** · aprobar, editar, validar por el estudiante · antes/ahora en las correcciones · copiar pendientes para WhatsApp (con `APP_URL`) · **refresco automático cada 30 s y al volver a la pestaña**, sin perder filtros ni posición · cerrar sesión visible en el encabezado.

**Coordinación (admin):**
- **Resumen:** avance total y tabla por ciudad (validados, corregidos, pendientes, % y monitores), de menor a mayor avance; se refresca cada 30 s.
- **Excel final:** botón de descarga con **3 columnas: Nombre completo, Correo (el corregido/aprobado) y Ciudad**, solo validados. También con `npm run export`.
- **Historial** de cambios en el detalle de cada estudiante.
- **Subir lista desde la web:** vista previa con nuevos, con datos cambiados, protegidos, los que ya no están, errores por fila y avisos; se aplica solo al confirmar. **Nunca sobrescribe validados ni corregidos.** Los que ya no están se muestran y solo se eliminan si se marcan. Mismo motor que `npm run import`.

## 5. Seguridad
- **Límite de intentos por IP** en la búsqueda por documento y en el login: 20 intentos **fallidos** cada 15 minutos (configurable con `RATE_LIMIT_MAX`), guardado en MongoDB con TTL. Solo cuentan los fallos para que un salón detrás de la misma red no se bloquee.
- Contraseñas con bcrypt; sesión en cookie `httpOnly`, `secure`, `SameSite=Lax`, firmada con HMAC; el usuario se relee en cada petición.
- Permisos validados en el servidor (`scopeFilter`, rutas `/admin` solo para `admin`).
- Cabeceras básicas (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS, `noindex`).
- Sin datos personales en el repositorio (el Excel real está en `.gitignore`).

## 6. Variables de entorno
```
MONGODB_URI=                 # usuario de Atlas con readWrite solo sobre validacion_jc
MONGODB_DB=validacion_jc
SESSION_SECRET=              # 32+ caracteres aleatorios
APP_URL=https://validacion.tocaunavida.org
STUDENT_PORTAL_ENABLED=true  # false = cierra la vista de estudiantes
NEXT_PUBLIC_PRIVACY_URL=     # enlace a la política de privacidad
RATE_LIMIT_MAX=20            # opcional
```

## 7. Despliegue
- **Repositorios:** `Fundacion-ROFE/validacion_jc` (origen, público) y el **fork `Cristian10-24/validacion_jc`**, que es el que está conectado a Vercel (la organización requiere aprobación de un propietario para conectar Vercel). Cada `git push` envía a los dos y Vercel despliega desde el fork.
- **Vercel** (plan gratuito): Framework Next.js, carpeta raíz `./`, comandos por defecto, variables de la sección 6.
- **Dominio:** `validacion.tocaunavida.org` con un registro CNAME `validacion` hacia el valor que indica Vercel.
- **Atlas:** Network Access `0.0.0.0/0` (Vercel no tiene IP fija) con un usuario limitado a `validacion_jc`.

## 8. Pendiente / siguiente
- Gestión de monitores desde la web (hoy: `npm run monitor:add` / `monitor:list`).
- Cambio de clave por el propio monitor.
- Cierre del portal y borrado de datos al terminar la entrega de certificados.

## Verificación
- `npm test`: validaciones de correo y nombre, normalización de ciudad y lectura de filas de importación.
- Pruebas manuales contra una base local: flujo del estudiante, permisos entre ciudades (404), límite de intentos (429), filtros en la URL y refresco, resumen, Excel, historial e importación (vista previa sin escribir, protegidos intactos, eliminación solo de los marcados).
