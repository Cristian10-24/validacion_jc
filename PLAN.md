# PLAN.md — Validación de datos · Jóvenes creaTIvos (Fundación ROFÉ) · Alcance MVP reducido

> Al aprobarse, este contenido se guarda en `C:\ROFÉ\PAGINAS\validation-jc\PLAN.md` y se implementa paso a paso. Te aviso cuando cada parte esté lista para probar.

## Contexto
Hay que validar el nombre completo y el correo personal de unos 700 estudiantes (9 ciudades, 9 monitores) antes de generar los certificados. Es una app temporal, mobile-first, en `validacion.tocaunavida.org`. La prioridad es tener un **MVP desplegado lo antes posible**, con la mínima complejidad.

**Decisiones cerradas**
- Los monitores se asignan **por ciudad** (un monitor puede tener varias).
- D1: partículas en minúscula (`de, del, la, las, los, y, e`).
- D2: un correo duplicado entre estudiantes **solo avisa** al monitor.
- D3: el monitor puede validar en nombre del estudiante con su declaración.
- D4: después de `validado`, solo el monitor puede corregir.
- D5: el Excel de ejemplo va en `/prototipos/ejemplo.xlsx`.
- D8: enlace a la política de privacidad (placeholder configurable `NEXT_PUBLIC_PRIVACY_URL`).

**Quitado del alcance:** fecha de nacimiento, Turnstile, código por correo, Brevo, rate limiting, sesiones de estudiante, cuota de correos y panel de administración (va después).

**Riesgo aceptado:** quien conozca o adivine un número de documento puede ver y modificar el nombre y el correo de ese estudiante. Se mitiga parcialmente así: las correcciones quedan `corregido` hasta que el monitor las aprueba, hay historial completo y el portal se puede cerrar con una variable de entorno.

---

## 1. Arquitectura
Es un monolito **Next.js (App Router) + TypeScript** en Vercel (runtime Node.js), con **MongoDB Atlas M0** a través del driver oficial `mongodb` y el patrón `clientPromise` global.

Dependencias: `next`, `react`, `mongodb`, `zod`, `bcryptjs` (claves de monitores), `exceljs` (scripts de importar y exportar), `tsx` (para correr los scripts) y `vitest`.
Estilos: CSS Modules + variables CSS tomadas de los prototipos de `/prototipos`.

```
validation-jc/
├─ prototipos/                 # diseños + ejemplo.xlsx (no se despliegan)
├─ public/logo-jc.png
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx, globals.css
│  │  ├─ page.tsx                       # Estudiante: buscar por documento
│  │  ├─ estudiante/[doc]/...           # (o estado en cliente) ver / confirmar / corregir
│  │  ├─ gracias/page.tsx               # Éxito / ya validado
│  │  ├─ cerrado/page.tsx
│  │  ├─ login/page.tsx                 # Login monitor
│  │  ├─ monitor/page.tsx               # Semáforo + lista
│  │  ├─ monitor/[id]/page.tsx          # Detalle: anterior vs. nuevo, acciones
│  │  └─ api/
│  │     ├─ estudiante/buscar/route.ts
│  │     ├─ estudiante/guardar/route.ts
│  │     ├─ auth/login/route.ts, auth/logout/route.ts
│  │     └─ monitor/estudiantes/route.ts, monitor/estudiantes/[id]/route.ts
│  ├─ lib/
│  │  ├─ db.ts            # clientPromise + getDb()
│  │  ├─ types.ts         # Student, User, ChangeLog
│  │  ├─ auth.ts          # sesión firmada en cookie, requireMonitor(), scopeFilter()
│  │  ├─ history.ts       # registrar cambios
│  │  └─ validation/
│  │     ├─ email.ts      # formato, dominio educativo, sugerencia de tipeo, duplicado
│  │     └─ name.ts       # limpiar espacios, Nombre Propio con partículas, aviso sin tildes
│  └─ components/         # basados en el prototipo
├─ scripts/
│  ├─ import.ts           # npm run import archivo.xlsx
│  ├─ export.ts           # npm run export [salida.xlsx]
│  └─ monitor.ts          # npm run monitor:add -- usuario "Nombre" "Ciudad1,Ciudad2"
├─ tests/                 # vitest: email.ts, name.ts, scopeFilter
├─ .env.example, next.config.ts, README.md, PLAN.md
```

## 2. Modelo de datos

**`students`**: `documento` (único, normalizado sin puntos ni espacios), `ciudad`, `grupo`, `monitorRef`, `nombreOriginal`, `correoOriginal`, `nombre`, `correo`, `correoNorm`, `nombrePropuesto?`, `correoPropuesto?`, `estado` (`pendiente` | `corregido` | `validado`), `aceptaCorreoPersonal`, `validadoPor {rol, usuario?}`, `validadoEn`, `actualizadoEn`.
Índices: `documento` único · `{ciudad, estado}` · `correoNorm`.

**`users`** (monitores; también sirve para una admin futura): `usuario` (único), `nombre`, `passwordHash` (bcrypt), `rol` (`monitor` | `admin`), `ciudades[]`, `activo`.

**`changeLog`**: `studentId`, `documento`, `campo`, `anterior`, `nuevo`, `actor {rol, usuario?}`, `accion` (`confirmar` | `corregir` | `aprobar` | `editar` | `validar_en_nombre` | `importar`), `fecha`.

**Semáforo:** verde = `validado` · amarillo = `corregido` (por revisar) · rojo = `pendiente`.

## 3. Rutas y API
| Ruta | Acceso | Qué hace |
|---|---|---|
| `POST /api/estudiante/buscar` `{documento}` | Público | Devuelve `{id, nombre, correo, estado, avisos}` o "no encontrado". Si ya está `validado`, lo indica. |
| `POST /api/estudiante/guardar` `{id, documento, accion: confirmar\|corregir, nombre?, correo?, aceptaCorreoPersonal: true}` | Público (rechaza si ya está `validado`) | Confirmar → `validado`. Corregir → guarda `*Propuesto` + `corregido`. Escribe el historial. |
| `POST /api/auth/login`, `POST /api/auth/logout` | Público / monitor | Cookie `httpOnly; secure; sameSite=lax` con un token firmado por HMAC (`SESSION_SECRET`) que contiene `{userId, rol, ciudades, exp}`. No hace falta una colección de sesiones. |
| `GET /api/monitor/estudiantes?estado=&q=` | Monitor (sus ciudades) / admin | Lista + conteos del semáforo |
| `GET /api/monitor/estudiantes/[id]` | Monitor (comprueba la ciudad) | Detalle con anterior vs. propuesto + historial |
| `POST /api/monitor/estudiantes/[id]` `{accion: aprobar\|editar\|validar_en_nombre, nombre?, correo?}` | Monitor (comprueba la ciudad) | Aprobar copia `*Propuesto` → `validado`. Editar guarda los valores → `validado`. Validar en nombre → `validado` con la declaración. |

La entrada se valida con Zod. `scopeFilter(session)` = `{ciudad: {$in: ciudades}}` y se aplica en el servidor a cada consulta y actualización. Si el estudiante es de otra ciudad, la respuesta es 404.
**Cierre del portal:** con `STUDENT_PORTAL_ENABLED=false`, la página del estudiante muestra `/cerrado` y su API responde 403.

## 4. Flujos

**Estudiante**
1. Escribe su número de documento → Buscar.
2. Si no existe: "No encontramos tu documento, revisa o contacta a tu monitor".
3. Si ya está validado: "Tus datos ya fueron validados".
4. Si no, ve "Así saldrá tu certificado": nombre y correo, con avisos (nombre sin tildes, correo educativo, dominio mal escrito, correo repetido).
5. Elige **"Mis datos están bien"** o **"Corregir"** (edita los campos con ayudas en vivo: "¿Quisiste decir gmail.com?" con un botón para aplicar la sugerencia, y aviso si el dominio es educativo).
6. Marca la casilla obligatoria **"Confirmo que este es mi correo personal y lo seguiré usando"** → Guardar → pantalla de gracias. Al pie aparece el enlace a la política de privacidad.

**Monitor**
1. Hace login con usuario y clave.
2. Ve el semáforo y la barra de avance de su ciudad o ciudades.
3. Lista con filtro por estado y un buscador.
4. Abre un estudiante y ve el dato anterior frente al nuevo, junto con el historial. Puede **Aprobar**, **Corregir** o **Validar en nombre del estudiante** (con la casilla "Hablé con el estudiante y confirmó estos datos").
5. El botón "Copiar pendientes para WhatsApp" es un extra barato que se incluye si el tiempo da.

**Coordinación (por ahora con scripts)**
- `npm run import archivo.xlsx`: lee las columnas `ciudad, grupo, documento, nombre, correo, monitor` (se ajustan a `ejemplo.xlsx`). Normaliza el documento, limpia el nombre a Nombre Propio y hace upsert por documento sin pisar registros `validado`. Imprime un resumen y los errores por fila.
- `npm run monitor:add`: crea un monitor con sus ciudades e imprime la clave temporal.
- `npm run export [archivo.xlsx]`: genera el Excel con documento, nombre, correo, ciudad, grupo, estado, validadoPor y validadoEn, más una hoja de pendientes.

## 5. Validaciones (`lib/validation`)
- **Correo:** formato. Aviso de dominio educativo o institucional (`.edu`, `.edu.xx`, `misena.edu.co`, `soy.sena.edu.co` + lista en el código). Sugerencia de tipeo con un mapa explícito (`gmial.com`, `gmail.co`, `hotmial.com`, `hotmail.co`, `outlok.com`…) más distancia de Levenshtein ≤ 2 contra `gmail.com`, `hotmail.com`, `outlook.com`, `yahoo.com`, `icloud.com`, `live.com`, `hotmail.es`, `outlook.es`, `yahoo.es`. Aviso de duplicado.
  - En el estudiante, el dominio educativo **bloquea guardar el correo** (el requisito es un correo personal) y el tipeo solo sugiere. Si prefieres que el educativo también sea solo un aviso, es un cambio de una línea.
- **Nombre:** recortar y colapsar espacios, Nombre Propio con partículas en minúscula y aviso si no tiene ninguna tilde. Nunca se agregan tildes automáticamente.

## 6. Variables de entorno
```
MONGODB_URI=
MONGODB_DB=validacion_jc
SESSION_SECRET=              # openssl rand -base64 32
STUDENT_PORTAL_ENABLED=true
NEXT_PUBLIC_PRIVACY_URL=     # enlace a la política de privacidad
```

## 7. Despliegue
- **Atlas M0:** cluster en AWS `us-east-1`, usuario con `readWrite` solo sobre `validacion_jc` y Network Access `0.0.0.0/0` (Vercel no tiene IP fija).
- **Vercel:** repositorio GitHub nuevo e independiente → importar en Vercel → cargar las variables de entorno → región de funciones `iad1` → cada `git push` a `main` despliega.
- **Dominio:** Vercel → Domains → `validacion.tocaunavida.org` → en el DNS de `tocaunavida.org`, un CNAME `validacion` → el valor que indique Vercel. El TLS es automático.

## 8. Orden de trabajo (aviso al terminar cada paso)
1. **Base + importación por script:** scaffold Next.js, `lib/db`, validaciones con pruebas, `scripts/import.ts`, `scripts/monitor.ts`. *Para probar:* importar `ejemplo.xlsx` en tu Atlas.
2. **Flujo del estudiante:** buscar, confirmar o corregir y guardar, con el estilo de los prototipos.
3. **Panel del monitor:** login, semáforo, lista de su ciudad, aprobar, corregir y validar en nombre del estudiante.
4. **Exportación por script** (`npm run export`).
5. **Despliegue** en Vercel + dominio (guía en el README, y te acompaño con los pasos que requieren tus cuentas).
6. Después: panel de administración (avance por ciudad y monitor, gestión de monitores, importar y exportar desde la web).

**Bloqueos actuales:** `/prototipos` sigue vacío (faltan los diseños y `ejemplo.xlsx`). Empiezo el paso 1 con las columnas supuestas y aplico el estilo cuando estén los archivos.

## Verificación
- `npm test`: email (educativos, tipeos, formato), nombre (partículas, espacios, tildes) y `scopeFilter`.
- Local: `npm run import prototipos/ejemplo.xlsx` → `npm run monitor:add` para dos monitores de ciudades distintas → `npm run dev`. Probar en el celular o con DevTools móvil: documento inexistente, confirmar → verde, corregir → amarillo → aprobar como monitor → verde; que el monitor B no vea ni pueda modificar estudiantes de A (404 también con `curl`); `npm run export` y abrir el .xlsx para revisar las tildes.
- Producción: el mismo recorrido en `https://validacion.tocaunavida.org`.
