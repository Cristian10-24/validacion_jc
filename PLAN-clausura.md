# PLAN-clausura.md — Módulo "Clausura y Expoferia"

> **Plan aprobado el 2026-11-06** con cambio de prioridades. Rama `feature/clausura` (worktree `C:\ROFÉ\PAGINAS\validation-jc-clausura`), commits por fase; al publicar, `merge --squash` a `main`. Sin push ni merge sin orden explícita.

## Decisiones (respuestas a la sección 13)
1. Entran todos (validado, pendiente, corregido). Si está `corregido`, saludo y correo oculto usan lo propuesto.
2. ~~Editar después de enviar~~ (cambiado el 2026-11-06): por defecto, al enviar ya NO se edita. Solo el admin reabre: por evento (`--permitir-edicion=si`) o por estudiante ("Reabrir respuesta" en el panel, queda en clausura_auditoria); al reabrir debe volver a enviar.
3. Acompañantes: preguntas normales del formulario.
4. Límite de intentos: se reutiliza `rateLimit.ts` (tipo `clausura`); la escritura en `rateLimits` es la única excepción, explícita en la prueba de seguridad.
5. Ciudades del evento: elegidas de las que existen en `students` + `nombreVisible` libre. Un evento puede cubrir varias ciudades.
6. Commits por fase en la rama; `merge --squash` a `main` al publicar.
7. Al estudiante, celular prellenado oculto (`300 ••• •• 33`) con "Cambiar número". En el Excel (interno) van completos el correo original, el nuevo y el celular.
8. Solo admin crea y edita eventos (`clausura_gestionar`). Coordinación ve, comenta, exporta y ve el avance.
9. No se agrega enlace en la portada de validación; `page.tsx` no se toca.
10. Fase 8 (decisión final, 2026-11-07): SOLO el admin inactiva y reactiva (motivo obligatorio al inactivar). Monitores y coordinación solo ven la etiqueta "Inactivo" y el filtro "Mostrar inactivos"; el servidor responde 403.
11. Fase 8: un solo interruptor por persona (students + testimonios_participantes por documento normalizado, donde exista), registrado en `changeLog` y `testimonios_auditoria`.
12. Datos reales los pasa el usuario; mientras tanto, datos de ejemplo.
- Fase 8: el Excel de certificados también excluye inactivos por defecto, con opción para incluirlos.

## Cambios del 2026-11-06 (tarde)
- `tipo` del evento: `expoferia` ("EXPOFeria y clausura") o `clausura` ("Clausura"); textos del formulario con `{evento}`, `{fecha}`, `{hora}`, `{lugar}`.
- Calendario hoy: .ics (UTC, CRLF, escapado, plegado) + enlace de Google Calendar, solo si asistirá (`opcionesAsisten`).
- Opción "Otro: ¿cuál?" (`otro: true`), texto con `formato` documento/url.
- `[POR DEFINIR]` en los JSON: el script no deja abrir el evento y dice qué falta.
- Datos reales: Cali (EXPOFeria, 14 nov, 9:00–12:00, Universidad Católica) y Cartagena (clausura, 19 nov, 3:00–5:00 p. m., Universidad Libertadores). Falta la fecha límite de ambos.

## Orden de trabajo (reemplaza la tabla de la sección 9)
**HOY (Cali y Cartagena):**
1. Fase 1: colecciones, esquema definitivo del formulario y de las respuestas, motor, prueba de seguridad, pruebas del motor.
2. Fase 2: ingreso, cookie, contacto, autoguardado, resumen, envío y edición (sin .ics).
3. Pantallas del estudiante `/clausura` y `/clausura/[slug]`.
4. En lugar del editor: `scripts/clausura-evento.ts` + `eventos/<ciudad>.json` (upsert por slug, `--dry-run`, `--estado=abierto|cerrado`), imagen en `public/clausura/`, JSON de ejemplo comentado en `docs/clausura/`.
5. Panel mínimo: "Clausura" en `AppShell`, `clausura_ver` y `clausura_comentar`, contadores, filtros, búsqueda, refresco, respuestas en lectura y comentarios.

**DESPUÉS (cada uno con OK):** Excel → editor visual (eventos y preguntas, luego lógica y versiones; mismo formato que los JSON) → subdominio (con redirect desde `/clausura/<slug>`) → .ics, resumen por ciudad y docs para coordinación → activo/inactivo.

---

## Contexto
Los estudiantes confirman su asistencia a la clausura y expoferia de su ciudad y responden un formulario que arma la coordinación desde la web (por ciudad y por evento). Monitores, coordinación y admin hacen seguimiento, comentan y exportan a Excel, como en Testimonios y Encuesta final.

Patrón que sigo (leído en el código): módulo aislado como `src/lib/encuesta/` (su propio `db.ts` con prefijo de colección, prueba estática de seguridad, `exigir()` + `sameOrigin()` + Zod en cada ruta, alcance por ciudad en la consulta, refresco cada 30 s, filtros en la URL, comentarios con `leerTextoComentario`).

---

## 0. Reglas y cómo se cumplen

| Regla | Cómo |
|---|---|
| No dañar lo que funciona | El módulo vive en carpetas nuevas (`src/lib/clausura/`, `src/app/clausura/`, `src/app/api/clausura/`, `src/app/admin/clausura/`, `src/components/Clausura*`). `/` y `StudentFlow` no cambian en ninguna fase (salvo el enlace opcional de la fase 7, que pido aprobar aparte). |
| Solo escribe en `clausura_*` | `src/lib/clausura/db.ts` es el único archivo que abre colecciones. `students` y `testimonios_participantes` se exponen tipadas como `Pick<…, "find" \| "findOne" \| "countDocuments" \| "distinct">`. Prueba `tests/clausura-seguridad.test.ts` igual a la de encuesta: nada de `collections()`, `.collection(...)` solo en `db.ts` y solo con `COLECCIONES_CLAUSURA.*` o las dos de lectura, y sobre `students`/`participantes` solo métodos de lectura. |
| ⚠️ Excepción: límite de intentos | Reutilizar `rateLimit.ts` (como pides) **escribe en `rateLimits`**, que no es `clausura_*`. Propongo aceptarlo como única excepción, explícita en la prueba de seguridad (solo vía `bloqueado()`/`registrarFallo()` importados de `@/lib/rateLimit`). Alternativa: contador propio en `clausura_intentos` (copia de 20 líneas). **Pregunta 4.** |
| Nunca Atlas | Pruebas con `mongodb-memory-server`; servidor local con el lanzador protegido (barrera `assertBaseLocal`, base `clausura_pruebas`), nunca `.env.local`. |
| Abrir/cerrar desde la base | Estado del evento (`borrador` / `abierto` / `cerrado`) en `clausura_eventos`. No usa `STUDENT_PORTAL_ENABLED` ni `portal.ts`. |
| Nada fijo en el código | Ciudad, nombre visible, lugar, dirección, fecha, hora, zona horaria, textos, imagen y preguntas se guardan en la base y se editan desde la web. En el código solo queda una lista corta de zonas horarias para elegir (Bogotá UTC-5, Panamá UTC-5, Guayaquil UTC-5, Montevideo UTC-3) con valor por defecto según el país de la ciudad (`paisDeCiudad` de `celular.ts`). |
| Rama y commits | Rama `feature/clausura` en un worktree aparte (`C:\ROFÉ\PAGINAS\validation-jc-clausura`), un commit por fase, `npm test` + `npx tsc --noEmit` + `npm run build` al cerrar cada una. Hook `pre-push` local que bloquea el push de la rama. Sin push ni merge sin tu orden. **Pregunta 6** sobre squash. |

### Archivos compartidos que tocaría (solo agregan)

| Archivo | Cambio | Fase |
|---|---|---|
| `src/lib/permisos.ts` | 5 permisos nuevos y su reparto por rol (+ `estudiantes_activo` en la fase 8) | 3 / 6 / 8 |
| `tests/permisos.test.ts` | Filas nuevas de la matriz | 3 / 6 / 8 |
| `src/components/AppShell.tsx` | 3 entradas en `NAV` y "Clausura" en el menú fijo del monitor; 3 valores nuevos en el tipo `Seccion` | 3 / 6 |
| `src/lib/rateLimit.ts` | `TipoLimite = "buscar" \| "login" \| "clausura"` (una palabra) | 2 |
| `src/proxy.ts` (**nuevo**, pero afecta a todas las peticiones) | Solo actúa si el host es el del subdominio; si no, `NextResponse.next()` en la primera línea | 6 |
| `.env.example`, `README.md` | Variables y sección nueva | 6 |
| `src/app/page.tsx` (opcional) | Enlace discreto "¿Vienes por la clausura?" debajo del flujo, solo si lo apruebas | 6 |
| Fase 8 | Sí toca módulos existentes: ver sección 10 | 8 |

`globals.css` no lo necesito: el módulo usa sus tokens y clases (`.btn`, `.input`, `.check`, `.note`, `.kicker`) y sus estilos propios van en `Clausura*.module.css`.

---

## 1. Modelo de datos (colecciones nuevas)

- **`clausura_eventos`**
  `slug` (único, p. ej. `barranquilla-2026`), `ciudades: string[]` (valores tal como están en `students.ciudad`, ver pregunta 5), `nombreVisible` ("Paysandú"), `titulo` ("Clausura y Expoferia 2026"), `kicker` ("CLAUSURA 2026"), `descripcion` (texto con formato básico), `lugar`, `direccion`, `mapaUrl` (si está vacío se arma uno de Google Maps con la dirección), `inicio` / `fin` (Date en UTC), `zonaHoraria` (IANA), `imagenId`, `estado` (`borrador` | `abierto` | `cerrado`), `fechaLimite` (opcional: después no se aceptan envíos ni ediciones aunque siga abierto), `permitirEdicion` (bool), `preguntaAsistenciaId` (qué pregunta es "¿Asistirás?"), `formulario` (ver 1.1), `formularioVersion`, `creadoPor`, `creadoEn`, `actualizadoEn`.
  Regla: **un solo evento abierto por ciudad** (se valida al abrir; si hay otro abierto para esa ciudad, avisa).
- **`clausura_formularios`** (historial de versiones): `{ eventoId, version, formulario, guardadoPor, guardadoEn }`. Cada vez que se guarda un formulario que ya tiene respuestas sube la versión y se guarda la copia; así una respuesta vieja siempre se puede mostrar y exportar con el texto que vio el estudiante.
- **`clausura_respuestas`**: `{ eventoId, studentId, documento, ciudad, formularioVersion, estado: "en_progreso" | "enviada", seccionActual, contacto: { correoConfirmado: bool, correoNuevo?, celular, tieneWhatsApp, whatsapp? }, respuestas: Record<preguntaId, valor>, iniciadaEn, enviadaEn?, editadaEn?, actualizadaEn }`. Índice único `{ eventoId, studentId }`. **Nunca** escribe en `students`.
- **`clausura_comentarios`**: `{ eventoId, studentId, texto, autor, fecha, editadoEn?, editadoPor? }` (mismo mecanismo que testimonios/encuesta).
- **`clausura_imagenes`**: `{ _id, tipo: "image/webp" | "image/jpeg", datos: Binary, bytes, ancho, alto, subidaPor, subidaEn }` (ver sección 5).
- **`clausura_auditoria`**: crear/editar/abrir/cerrar/duplicar evento, guardar formulario, subir imagen: quién, qué, cuándo.

El **estado del estudiante no se guarda en `students`**: se calcula al leer. Sin respuesta → *Sin responder*; `en_progreso` → *En progreso*; `enviada` → *Respondió*.

### 1.1 Esquema del formulario (JSON en el evento, validado con Zod al guardar)
```ts
Formulario = { secciones: Seccion[] }
Seccion    = { id, titulo, descripcion?, mostrarSi?: Condicion, despues?: Destino, archivada?: bool, items: Item[] }
Item       = Pregunta | Bloque
Pregunta   = { id, tipo: "texto"|"parrafo"|"unica"|"casillas"|"desplegable"|"sino"|"numero"|"fecha"|"telefono",
               titulo, ayuda?, obligatoria, opciones?: { id, texto, irA?: Destino }[], min?, max?,
               mostrarSi?: Condicion, archivada?: bool }
Bloque     = { id, tipo: "info", texto?, imagenId?, mostrarSi?: Condicion }
Condicion  = { preguntaId, op: "=" | "≠" | "incluye", valor }        // valor = id de opción, "si"/"no", número o texto
Destino    = "siguiente" | "enviar" | { seccionId }
```
- Los IDs son cortos y aleatorios (`q_7fk2…`), se crean una vez y **nunca cambian** al editar el texto. Las opciones también tienen ID, así que corregir el texto de una opción no rompe respuestas ni condiciones.
- La sección 0 ("Tus datos de contacto") es fija del sistema, no se edita ni se puede ocultar.
- Texto con formato básico: un subconjunto tipo Markdown (**negrita**, *cursiva*, enlaces, listas, saltos de línea) que se convierte a React sin `dangerouslySetInnerHTML`.

---

## 2. Motor de formularios (funciones puras, `src/lib/clausura/formulario/`)

- **`camino(formulario, respuestas)`**: recorre las secciones desde la primera aplicando, en este orden: `mostrarSi` de la sección (si no se cumple, se salta), luego el `irA` de la opción elegida en la **última** pregunta de opción única con salto de esa sección (como Google Forms), si no el `despues` de la sección, si no la siguiente. `"enviar"` termina. Protege contra ciclos (una sección no se visita dos veces; si el editor guarda un salto hacia atrás, se rechaza al guardar).
- **`visibles(seccion, respuestas)`**: preguntas y bloques cuyo `mostrarSi` se cumple; las archivadas nunca son visibles para responder.
- **`esquemaZod(formulario, respuestas)`**: arma un `z.object(...).strict()` solo con las preguntas visibles del camino: obligatoria → requerida; `texto` ≤ 300, `parrafo` ≤ 3000, `unica`/`desplegable` → enum de IDs de opción, `casillas` → array de IDs sin repetir (con mín/máx opcional), `sino` → `"si" | "no"`, `numero` → entero/decimal con mín/máx, `fecha` → `AAAA-MM-DD` válida, `telefono` → misma regla de `celular.ts`.
- **`limpiar(formulario, respuestas)`**: descarta las respuestas de preguntas que no están en el camino visible (si el estudiante cambió una respuesta y una rama quedó oculta, lo de esa rama se borra al guardar).
- El servidor **siempre** recalcula el camino; el navegador usa las mismas funciones solo para la experiencia.
- **Reglas de edición con respuestas** (`validarCambioFormulario(viejo, nuevo, idsConRespuesta)`): se puede cambiar texto, agregar preguntas/opciones/secciones y archivar; **no** se puede borrar una pregunta u opción con respuestas, ni cambiar el tipo de una pregunta con respuestas (solo archivarla y crear otra). Saltos que apunten a secciones inexistentes o hacia atrás se rechazan.

Pruebas (`tests/clausura-formulario.test.ts`): ramas por opción única, "ir a sección X", "enviar" anticipado, `mostrarSi` con `=`, `≠` e `incluye`, condición que depende de otra sección, respuestas de ramas ocultas descartadas, obligatorias ocultas que no se exigen, ciclos rechazados, reglas de edición.

---

## 3. Experiencia del estudiante

### 3.1 Rutas
- `/clausura`: portada general ("CLAUSURA 2026", texto corto) con el campo de documento y, debajo, la lista de eventos abiertos para elegir ciudad.
- `/clausura/[slug]`: portada del evento (imagen, título, ciudad visible, lugar, dirección con enlace al mapa, fecha y hora en la zona del evento con su sigla, p. ej. "sáb 29 nov · 4:00 p. m. (hora de Uruguay)", descripción) y el campo de documento.
- Si el evento está en `borrador` o no existe → 404. `cerrado` → portada con "Este evento ya cerró sus confirmaciones".

### 3.2 Ingreso
- `POST /api/clausura/ingresar { documento, slug? }`: `normalizeDocumento` → `students.findOne({ documento })` (solo lectura).
  - No existe → `registrarFallo("clausura")` y "Tu documento no aparece" (mismo texto y tono que validación).
  - Existe → evento **abierto** cuya lista de ciudades incluye la del estudiante. Si entró por el slug de otra ciudad, se le lleva al de la suya (no se le dice nada de la otra). Si su ciudad no tiene evento abierto: **"Pronto publicaremos la información de tu ciudad"**.
  - Sujeto a las respuestas de las preguntas 1 (estado de validación) y del activo/inactivo (fase 8).
- Cookie `clausura_est`: httpOnly, `secure`, `SameSite=Lax`, `path=/api/clausura`, firmada con HMAC (clave derivada de `SESSION_SECRET` con el prefijo `"clausura:"`, en el propio módulo, sin tocar `auth.ts`), contiene `{ studentId, eventoId, exp }`, dura **2 horas** y se renueva en cada guardado. Las rutas de autoguardado solo aceptan la cookie (nunca el documento).

### 3.3 Sección 0 — datos de contacto (siempre primera)
- "Hola, {nombre validado}." (si el estudiante está `corregido`, ver pregunta 1).
- Correo oculto: `ju•••••@gmail.com` (2 primeras letras + puntos + dominio completo; para usuarios de 1–2 letras se muestra solo la primera). Lo arma el servidor: **el correo completo nunca llega al navegador**. "¿Sigue siendo tu correo?" Sí / No → si no, campo nuevo con `checkEmail` (las mismas ayudas de validación: correo educativo, dominio mal escrito). Se guarda solo en `clausura_respuestas.contacto.correoNuevo`.
- Celular: si `testimonios_participantes` (lectura, por documento) tiene uno, aparece prellenado ("¿Este es tu celular?"). Se valida con `celularConIndicativo` según la ciudad. "¿Tiene WhatsApp?" Sí / No / "Mi WhatsApp es otro número" → segundo campo.
- Para el celular prellenado también se muestra parcialmente oculto (`300 ••• •• 33`) — **pregunta 7**.

### 3.4 Secciones, autoguardado y envío
- Una sección por pantalla, barra de avance (sección N de M del camino actual), "Atrás" / "Siguiente".
- `PUT /api/clausura/respuesta { seccionId, respuestas }` al pasar de sección: valida solo esa sección con `esquemaZod`, guarda, limpia ramas ocultas y devuelve la siguiente sección según `camino()`. Si cierra y vuelve a entrar, continúa en `seccionActual`.
- Pantalla de **resumen** con todas las respuestas visibles (y "Editar" por sección) → **Enviar** (`POST /api/clausura/respuesta/enviar`: valida el formulario completo en el servidor).
- **Éxito**: "¡Listo! Te esperamos" con los datos del evento y **"Agregar al calendario"** (`GET /api/clausura/eventos/[slug]/ics`, archivo .ics generado a mano, sin dependencias).
- Si ya respondió: ve el resumen; si el evento sigue abierto, `permitirEdicion` es verdadero y no pasó `fechaLimite`, puede editar (queda `editadaEn`). Si no, solo lectura.

### 3.5 Diseño
Mismos tokens y piezas que validación (`--orange`, Outfit, `--bg` crema, tarjeta blanca redondeada, círculos y puntos decorativos de `StudentFlow.module.css`, `.btn`, `.input`, `.check`, `.note`, `.kicker`), primero celular. Tuteo y frases cortas. Componentes nuevos: `ClausuraPortada`, `ClausuraFlujo`, `ClausuraPregunta` (un renderer por tipo), con su `Clausura.module.css`.

---

## 4. Panel de monitores, coordinación y admin

### 4.1 Permisos nuevos (`permisos.ts`)
| Permiso | Monitor | Coordinación | Admin |
|---|:-:|:-:|:-:|
| `clausura_ver` | sus ciudades | todas | todas |
| `clausura_comentar` | sus ciudades | todas | todas |
| `clausura_exportar` | sus ciudades | todas | todas |
| `clausura_resumen` (avance por ciudad) | — | ✓ | ✓ |
| `clausura_gestionar` (eventos y formularios) | — | — | ✓ |

¿Coordinación debería poder crear/editar eventos? La guía en `docs/clausura/` va dirigida a coordinación… **Pregunta 8.**

### 4.2 Pantallas
- **`/clausura/panel`** (menú "Clausura"): selector de evento (por defecto el abierto de su ciudad), contadores *Sin responder / En progreso / Respondió* y por respuesta de asistencia (las opciones de la pregunta configurada), filtros por estado, ciudad y asistencia + búsqueda, en la URL; refresco cada 30 s. Fila: nombre, documento, ciudad, grupo, estado, asistencia, celular con indicativo, WhatsApp, última actualización; al abrir: respuestas en modo lectura y comentarios (crear y editar los propios, autor y fecha). La lista sale de `students` con `scopeFilter(user)` (alcance en la consulta; otra ciudad → 404).
- **`/clausura/resumen`** (coordinación y admin): por ciudad, totales por estado y por asistencia, de menor a mayor avance.
- **`/admin/clausura`** (admin): lista de eventos con estado; crear, editar, duplicar, abrir/cerrar.

Rutas API: `GET /api/clausura/panel?evento=`, `POST /api/clausura/panel/[studentId]/comentarios`, `PATCH …/comentarios/[comentarioId]`, `GET /api/clausura/resumen`, `GET /api/clausura/exportar`, y bajo `/api/admin/clausura/eventos/**` las de gestión. Todas con `exigir()`, `sameOrigin()` en mutaciones y Zod `.strict()`.

---

## 5. Imágenes (sin servicios pagos)

| Opción | A favor | En contra |
|---|---|---|
| **A. MongoDB `clausura_imagenes` (recomendada)** | Sin dependencias ni cuentas nuevas; respaldo junto con el resto; las mismas reglas de acceso | Usa espacio de Atlas M0 (512 MB en total). Con un tope de 400 KB por imagen, 50 imágenes son 20 MB |
| B. Vercel Blob (capa gratuita) | CDN, no ocupa Atlas | Dependencia nueva (`@vercel/blob`), crear el store y un token en Vercel, y las imágenes quedan con URL pública fuera de la base |

Propuesta A: el navegador **redimensiona y comprime** antes de subir (canvas → WebP, o JPEG si el navegador no lo soporta; lado mayor 1600 px para portada y 1200 px para bloques, calidad 0,8, reintenta bajando calidad hasta ≤ 400 KB). El servidor revisa los bytes mágicos (solo WebP/JPEG/PNG), el tamaño (≤ 400 KB), el permiso `clausura_gestionar` y el origen. Se sirven en `GET /api/clausura/imagenes/[id]` con `Cache-Control: public, max-age=31536000, immutable` (el id cambia si cambia la imagen). Sin `sharp` (aunque viene con Next, no lo usaría como dependencia directa).

---

## 6. Editor (admin) — dividido en dos fases

- **Fase 3 – Editor básico:** datos del evento (todos los campos de 1, imagen con vista previa), estado, fecha límite, permitir edición, pregunta de asistencia; secciones y preguntas (agregar, editar texto, tipo, opciones, obligatoria, mover arriba/abajo, archivar); bloques informativos; **duplicar** un evento a otra ciudad (copia datos y formulario con IDs nuevos de evento pero **los mismos IDs de preguntas**, así el Excel de "todos los eventos" alinea columnas iguales); vista previa como estudiante (el flujo real en modo prueba, sin guardar).
- **Fase 5 – Lógica:** por opción, "ir a…" (siguiente sección / sección X / enviar); por sección, "después de esta sección"; por pregunta/bloque/sección, "mostrar solo si (pregunta) = / ≠ / incluye (valor)", con selectores (no texto libre); avisos en vivo de saltos inválidos; versión del formulario y bloqueo de borrado de preguntas con respuestas.

El editor guarda el formulario completo (no pregunta a pregunta) con una marca de `actualizadoEn` para detectar si otra persona lo cambió mientras tanto (responde 409 y pide recargar).

---

## 7. Enlace y subdominio

| | A. Solo rutas propias (`/clausura`, `/clausura/[slug]`) | B. Subdominio `clausura.tocaunavida.org` + rutas de A por debajo |
|---|---|---|
| Configuración | Ninguna | DNS + dominio en Vercel + `src/proxy.ts` |
| Enlace para estudiantes | `validacion.tocaunavida.org/clausura/barranquilla` | `clausura.tocaunavida.org/barranquilla` |
| Riesgo para validación | Nulo | Bajo: el `proxy` corre en **todas** las peticiones del proyecto; se mitiga con la salida inmediata por host y pruebas |
| Claridad para el estudiante | Mezcla "validación" con "clausura" | Enlace propio y fácil de dictar |

**De acuerdo con B sobre A.** En Next 16 *middleware* se llama **proxy** (`src/proxy.ts`, corre en Node.js). Comportamiento:
- Host distinto de `CLAUSURA_HOST` → `NextResponse.next()` sin más (validación queda igual).
- En `clausura.tocaunavida.org`: `/` → *rewrite* a `/clausura`; `/{slug}` → `/clausura/{slug}`; `/api/clausura/**`, `/_next/**`, `/logo-jc.png` pasan; cualquier otra ruta (`/login`, `/monitor`, `/admin`, `/`, otras APIs) → **redirect** a `https://validacion.tocaunavida.org/...` para que el panel siga en un solo dominio (y las cookies de sesión no se mezclen).
- `CLAUSURA_HOST` es variable de entorno (vacía = proxy inactivo). Pruebas unitarias del `proxy` con los dos hosts.
- Alternativa sin código en tiempo de ejecución: `rewrites` con `has: [{ type: "host" }]` en `next.config.ts`; no la prefiero porque no permite el redirect de las demás rutas tan claro y toca un archivo de configuración compartido.

**Pasos tuyos (cuando llegue la fase 6):**
1. Vercel → proyecto → *Settings → Domains* → *Add* `clausura.tocaunavida.org` (sin redirección, asignado a *Production*).
2. En el DNS de `tocaunavida.org`: registro **CNAME** `clausura` → el valor que muestre Vercel (como el de `validacion`).
3. Esperar "Valid Configuration" en Vercel (certificado automático).
4. Variable `CLAUSURA_HOST=clausura.tocaunavida.org` en Vercel (Production) y *Redeploy*.

Opcional en la portada actual: enlace de texto pequeño "¿Vienes por la clausura?" debajo de la tarjeta, sin tocar el flujo (`StudentFlow` no cambia; va en `page.tsx`). Lo dejo apagado por defecto y lo activo solo si lo apruebas (**pregunta 9**).

---

## 8. Exportar a Excel (`exceljs`)

`GET /api/clausura/exportar?evento=<id|todos>&sinResponder=0|1` (`clausura_exportar`; monitor solo sus ciudades, filtro en la consulta).
- Hoja **"Respuestas"**: una fila por estudiante. Columnas fijas: Documento, Nombre, Ciudad, Grupo, Evento, Estado, Correo (confirmado → "Confirmó: ju…@…" o el nuevo **completo**, ver pregunta 7), Celular con indicativo, WhatsApp, Inicio, Envío, Última edición, Comentarios del monitor (todos, "fecha · autor: texto", separados por salto de línea). Luego **una columna por pregunta** con su texto como encabezado (casillas unidas con ", "; opciones por su texto; preguntas que la lógica saltó, en blanco; preguntas archivadas al final con "(archivada)").
- Con "todos los eventos": las columnas se alinean por ID de pregunta (por eso duplicar conserva los IDs); preguntas propias de un evento quedan en blanco en los demás.
- Hoja **"Preguntas"**: ID, Evento, Sección, Texto, Tipo, Obligatoria, Archivada.
- El texto de las opciones y preguntas sale de la versión del formulario guardada en cada respuesta.

---

## 9. Fases (un commit cada una, con pruebas y build)

| # | Fase | Entrega |
|---|---|---|
| 1 | **Base y motor** | Worktree, rama, hook; `db.ts` con colecciones e índices `clausura_*`; tipos y esquema Zod del formulario; motor (`camino`, `visibles`, `esquemaZod`, `limpiar`, reglas de edición); prueba de seguridad; pruebas del motor. Sin pantallas. |
| 2 | **Ingreso y API del estudiante** | `rateLimit` tipo `clausura`; ingreso, cookie firmada, contacto (correo oculto, celular prellenado), autoguardado, envío, edición, `.ics`; pruebas con `mongodb-memory-server` (ruteo por ciudad, "pronto publicaremos", 429, cookie inválida/vencida, ramas descartadas, correo nunca completo en la respuesta). |
| 3 | **Admin: eventos y editor básico** | `clausura_gestionar`; CRUD de eventos, imágenes, estados, duplicar, editor de secciones/preguntas/bloques, vista previa; pruebas de 403 por rol. |
| 4 | **Portal del estudiante (pantallas)** | `/clausura` y `/clausura/[slug]` completos en celular y computador; revisión en navegador con datos ficticios. |
| 5 | **Editor de lógica y versiones** | Saltos, `mostrarSi`, avisos, versiones, archivado; pruebas de edición con respuestas. |
| 6 | **Panel, avance y subdominio** | Permisos `clausura_ver/comentar/resumen`, `AppShell`, panel, comentarios, resumen por ciudad; `src/proxy.ts`; enlace opcional; pruebas de alcance (404) y del proxy. |
| 7 | **Excel y documentación** | Exportación; `docs/clausura/` (guía para coordinación: crear evento, armar preguntas, condiciones, abrir/cerrar, exportar; y `PRODUCCION.md` con pasos de Vercel/DNS); README. |
| 8 | **Activo / inactivo** (aparte, después de entregar la clausura) | Ver sección 10. |

Al cerrar cada fase te digo qué cambió, cómo probarlo localmente (`npm run dev:local-clausura` con base local y datos ficticios de `scripts/clausura-semilla.ts`) y qué variables o pasos necesito de ti.

**Variables nuevas:** `CLAUSURA_HOST` (fase 6). Ninguna otra: la cookie usa `SESSION_SECRET`.

---

## 10. Fase 8 — Estado activo / inactivo

Esta fase **sí escribe en colecciones existentes** (`students`, `testimonios_participantes`) y toca módulos que ya funcionan; por eso va sola y la confirmo contigo antes de empezarla.

- Campos nuevos (solo se escriben al marcar): `activo: false`, `inactivoMotivo`, `inactivoEn`, `inactivoPor {usuario, nombre, rol}`; al reactivar `activo: true` y se conservan los datos del último cambio. **Sin migración:** el filtro de activos es `{ activo: { $ne: false } }` (sin el campo = activo).
- Registro: en `students` → `changeLog` con `campo: "activo"` y `accion: "activar" | "inactivar"` (amplía dos uniones de tipos en `types.ts`); en participantes → `testimonios_auditoria`.
- Permiso `estudiantes_activo`: **solo admin** (decisión final). Botón "Inactivar / Reactivar" en el menú ⋯ de la fila, en Estudiantes y en Clausura.
- ¿Debe ser un solo interruptor por persona (al inactivar en `students`, se inactiva también su participante de testimonios con el mismo documento)? **Pregunta 11.**

Consultas afectadas (todas pasan a excluir inactivos por defecto, con `?inactivos=1` / filtro "Mostrar inactivos" y etiqueta "Inactivo"):

| Archivo | Consulta | Cambio |
|---|---|---|
| `src/lib/monitor-view.ts:35` | lista de estudiantes del panel | filtro + etiqueta |
| `src/app/api/admin/resumen/route.ts:14` | aggregate por ciudad/estado | `$match` activos |
| `src/lib/export.ts:23` y `:75` | Excel final y pendientes | excluir inactivos (pregunta: ¿el Excel de certificados también?) |
| `src/app/api/estudiante/buscar/route.ts:19` y `guardar/route.ts:30` | portal de validación | inactivo → "Escríbele a tu monitor" |
| `src/lib/testimonios/vista.ts:37`, `resumen.ts`, `exportar.ts` | lista, avance, Excel de pendientes | filtro |
| `src/lib/encuesta/vista.ts:35`, `resumen.ts` | lista y avance | filtro |
| `src/lib/clausura/*` | panel, resumen, Excel, ingreso | filtro + mensaje al ingresar |
| `src/lib/importer.ts:98`, `testimonios/lista-aplicar.ts` | importaciones | **no cambian** (deben ver a todos) |
| `testimonios/registro.ts`, `sin-duenio.ts`, encuesta `cruce` | cruce de respuestas | **no cambian** (un inactivo puede seguir siendo dueño de una respuesta) |

Pruebas: con un conjunto ficticio sin ningún campo `activo`, los conteos de cada resumen y lista son **idénticos** antes y después; con un inactivo, baja en 1 y reaparece con el filtro; matriz de permisos.

---

## 11. Pruebas (Vitest)

Nota: hoy las pruebas usan *mocks* de `@/lib/db`; `mongodb-memory-server` está en `devDependencies` pero ninguna prueba lo usa todavía. Lo usaré en las de clausura que necesitan consultas reales (la primera ejecución descarga un `mongod` de unos 100 MB y luego queda en caché).

- `clausura-formulario`: motor y ramas (sección 2).
- `clausura-estudiante`: ingreso, ruteo por ciudad, cookie, autoguardado, envío, edición según `permitirEdicion`/`fechaLimite`/estado, correo oculto, `.ics`.
- `clausura-permisos`: 401/403 por rol en cada ruta; monitor de otra ciudad → 404 en panel/comentarios y solo sus ciudades en el Excel.
- `clausura-exportar`: columnas, casillas unidas, saltadas en blanco, hoja "Preguntas", alineación por ID con varios eventos.
- `clausura-seguridad`: solo escribe en `clausura_*` (+ la excepción de `rateLimits` si la apruebas).
- `clausura-proxy`: host de validación intacto; subdominio reescribe y redirige.
- Fase 8: conteos sin cambios para activos.

---

## 12. Lo que choca o conviene saber

1. **`rateLimits` no es `clausura_*`** (sección 0). Pregunta 4.
2. **Ciudad de los estudiantes vs. catálogo.** `students.ciudad` viene de `normalizeCity` (texto del Excel), no del catálogo de testimonios. No sé (y no voy a mirar en producción) si los de Paysandú están como "Paysandú" o "Uruguay". Por eso el evento guarda `ciudades[]` elegidas de los valores que existen en `students` (lectura `distinct`) y un `nombreVisible` libre. Así sirve para cualquier ciudad presente o futura sin tocar el catálogo. Pregunta 5.
3. **Correo de quien no ha validado.** Un `corregido` tiene `correoPropuesto` sin aprobar; un `pendiente`, el del Excel. Pregunta 1.
4. **El monitor ve el correo completo del estudiante** en su panel de validación, pero aquí el estudiante solo ve el suyo oculto. En el Excel de clausura, ¿correo nuevo completo? Pregunta 7.
5. **`mongodb-memory-server`** no lo usa ninguna prueba hoy (ver 11).
6. **Un commit por fase vs. `merge --squash`** (flujo de la guía para no publicar commits intermedios). Pregunta 6.
7. **El portal no depende de `STUDENT_PORTAL_ENABLED`**: si algún día cierras validación con esa variable, la clausura sigue abierta (es lo que pides; lo dejo escrito).

---

## 13. Preguntas para ti

1. **¿Pueden entrar quienes no validaron sus datos (pendiente o corregido)?** Propuesta: sí, todos; el saludo usa el nombre propuesto si está `corregido` (como hace el portal de validación) y el correo oculto es el propuesto. Alternativa: solo `validado`, y a los demás "Primero valida tus datos" con enlace a `/`.
2. **¿Se permite editar después de enviar, y hasta cuándo?** Propuesta: sí por defecto, mientras el evento esté abierto y antes de `fechaLimite` (configurable por evento con `permitirEdicion`).
3. **¿Acompañantes?** Propuesta: no como función especial; si un evento los necesita, se arman con preguntas normales ("¿Vienes con acompañantes?" sí/no → sección "Acompañantes" con número, nombres y parentesco), así no se fija en el código. Si quieres algo estructurado (máximo por evento, nombre y documento de cada uno, total en el avance), dímelo y lo agrego como tipo de pregunta.
4. **Límite de intentos:** ¿acepto la excepción de escribir en `rateLimits` (reutilizando `rateLimit.ts`) o uso `clausura_intentos`?
5. **Ciudades del evento:** ¿te sirve elegirlas de las ciudades que existen en `students` (más un nombre visible libre)? ¿Un evento puede cubrir varias ciudades (p. ej. Cartagena y Barranquilla juntas)?
6. **Commits:** ¿al final fusiono con `--squash` (un solo commit en `main`, como hasta ahora) o con los commits por fase?
7. **Datos sensibles:** ¿el celular prellenado se muestra completo u oculto al estudiante? ¿El Excel lleva el correo nuevo completo y el original oculto?
8. **¿Coordinación puede crear y editar eventos** (`clausura_gestionar`) o solo admin?
9. **¿Agrego el enlace "¿Vienes por la clausura?"** en la portada de validación?
10. **Fase 8:** ¿el monitor puede marcar inactivo en sus ciudades (sin reactivar)?
11. **Fase 8:** ¿un solo interruptor por persona (students + participante de testimonios con el mismo documento) o separados?
12. **Fechas reales:** ¿tienes ya fecha, lugar y hora de cada ciudad? No van en el código, pero me sirven para la semilla de prueba (con datos ficticios igual funciona).
