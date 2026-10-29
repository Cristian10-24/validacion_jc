# PLAN-testimonios.md — Módulo de seguimiento de testimonios

> Plan aprobado. Rama local `feature/testimonios` (worktree `C:\ROFÉ\PAGINAS\validation-jc-testimonios`). Se implementa por pasos; sin push ni merge hasta que se autorice.

## Contexto
Los participantes suben su video testimonio en un Google Form. Las respuestas llegan a un Google Sheet con estas columnas: Marca temporal · Nombre Completo · Número de documento · Correo · **Celular** (pregunta nueva que vas a agregar) · Ciudad · Enlace de Drive.

Hace falta saber quién ya lo envió, hacer seguimiento a quien falta y resolver las respuestas que no se pueden asignar a nadie. Es un módulo **independiente** de la validación de datos: tiene su propia lista de participantes y sus propias colecciones, y no altera nada de lo existente.

**Decisiones tomadas:**
- El cruce se hace por documento, correo **o** celular. Las respuestas que lleguen sin celular cruzan por documento o correo.
- El catálogo de ciudades es una **lista fija en el código** (las 9 ciudades actuales). No se lee ni se toca `students`.

---

## 0. Reglas de seguridad (prioridad sobre todo)

| Regla | Cómo se cumple |
|---|---|
| No tocar datos existentes | El módulo **solo escribe** en colecciones nuevas con prefijo `testimonios_`. De `users` solo **lee** el rol y las ciudades de la sesión, usando el `getCurrentUser()` actual sin cambios. No hay migraciones. No se tocan `students`, `changeLog`, `rateLimits` ni ninguna otra colección. |
| Los índices nuevos | Solo se crean sobre colecciones `testimonios_*`. Una prueba automática revisa el código del módulo y falla si encuentra una escritura (`insert`/`update`/`delete`/`createIndex`) sobre algo que no empiece por `testimonios_`. |
| Nunca Atlas | **Barrera** `assertBaseLocal()`: aborta si la URI contiene `mongodb.net` o `mongodb+srv`, o si el host no es `127.0.0.1`/`localhost`. Se aplica en las pruebas, en los scripts del módulo y en un lanzador `npm run dev:local-testimonios` que la verifica antes de arrancar `next dev`. **No va dentro del código de la app**, porque en producción la URI sí es Atlas. Nunca uso `.env.local`: siempre paso `MONGODB_URI=mongodb://127.0.0.1:27099` y `MONGODB_DB=testimonios_pruebas` de forma explícita. |
| Nada a producción | Trabajo en la rama **local** `feature/testimonios`, en un **git worktree aparte**: `C:\ROFÉ\PAGINAS\validation-jc-testimonios`. En `C:\ROFÉ\PAGINAS\validation-jc` no se cambia de rama, porque ahí está `main` y puede haber otra sesión trabajando. Solo commits locales, **sin push** a ningún remoto, y **sin fusionar** con `main` ni hacer rebase hasta que lo autorices. Como red de seguridad, un hook local `pre-push` (no versionado) bloquea cualquier push de `feature/testimonios`. |
| Si algo obliga a tocar datos | Me detengo y te pregunto. |
| Al terminar cada paso | Borro la base de prueba local, detengo los procesos y elimino los temporales. |

---

## 1. Modelo de datos (solo colecciones nuevas)

- **`testimonios_participantes`**: `documento` (único, normalizado), `nombres`, `apellidos`, `nombre` (Nombre Propio), `celular` (solo dígitos), `celular10` (últimos 10 dígitos), `correo` (en minúsculas), `ciudad` (del catálogo), `creadoEn`, `actualizadoEn`.
  Índices: `documento` único, `correo`, `celular10`, `ciudad`.
- **`testimonios_respuestas`**: `clave` (**única**, para la idempotencia), `recibidaEn`, `marcaTemporal`, `fila`, `original` (la respuesta completa tal como llegó), `norm` (`documento`, `correo`, `celular10`, `nombre`, `ciudad`), `enlace`, `participanteId` (o null), `cruce` (`auto` | `manual` | `sin_duenio` | `conflicto` | `descartada`), `asignacion` (`{ por, en }` cuando es manual o descartada).
  Índices: `clave` único, `participanteId`, `cruce`.
- **`testimonios_comentarios`**: `participanteId`, `texto`, `autor` (`usuario`, `nombre`, `rol`), `fecha`. Índice: `{ participanteId, fecha }`.
- **`testimonios_auditoria`**: registro de las acciones de administración (subir lista, asignar o descartar respuestas): quién, qué, cuándo y el detalle.

El **estado no se guarda**: se calcula al leer, así nunca queda desincronizado.
- **Realizado** (verde): tiene al menos una respuesta con `cruce` auto o manual. Se muestran la más reciente y las anteriores.
- **Pendiente** (rojo): no tiene ninguna respuesta auto o manual (las sin dueño, en conflicto o descartadas no cuentan).
- *(Ajuste aprobado, 2026-10-29: "Seguimiento" dejó de ser un estado.)* Un pendiente con comentarios sigue siendo **Pendiente** y lleva la etiqueta amarilla **"Con comentarios"**. Contadores: Todos = Realizado + Pendiente; "Con comentarios" es un filtro dentro de Pendiente. Orden: pendientes sin comentarios (alfabético) → pendientes con comentarios (el comentario más reciente primero) → realizados (el envío más reciente primero). El Excel trae todos los pendientes con la columna "Con comentarios" (Sí/No) y el último comentario.
- *(Ajuste aprobado, 2026-10-29.)* **Editar comentarios:** solo su autor (por `autor.usuario`; los demás reciben 403), con las mismas validaciones que al crear. Se actualiza solo ese comentario (`texto`, `editadoEn`, `editadoPor`), sin guardar el texto anterior, y se muestra "Editado · fecha". Los comentarios no se pueden borrar.

## 2. Normalización y cruce (`src/lib/testimonios/cruce.ts`, funciones puras con pruebas)

- **Normalización** (se reutilizan `normalizeDocumento`, `normalizeEmail`, `toProperName` y `cleanSpaces` del proyecto):
  - documento sin puntos ni espacios;
  - correo en minúsculas;
  - celular solo dígitos, comparando los **últimos 10**. Se toleran prefijos (+57, +507, +598, +593…), espacios, guiones y paréntesis: se quitan todos los caracteres que no son dígitos y se toman los últimos 10. Si quedan menos de 7 dígitos, el celular no se usa para cruzar. En el formulario la pregunta se llama **"Número de WhatsApp o Celular"**. Las respuestas anteriores no la tienen, así que cruzan por documento o correo;
  - **enlaces del video**: si la celda trae varios (separados por comas, espacios o saltos de línea), se guardan y se muestran **todos** (`enlaces: string[]`);
  - ciudad contra el catálogo fijo, con `ciudadExistente()` para tolerar tildes y mayúsculas. Las ciudades que no estén en el catálogo son error de fila.
- **Coincidencias** (ajuste aprobado: **gana el documento**). El nombre nunca se usa para cruzar.
  1. Si el documento coincide con **un único** participante, la respuesta es suya (`auto`, `cruzadoPor: "documento"`), aunque el correo o el celular coincidan con otra persona. Ejemplo: hermanos que comparten correo.
  2. Solo si el documento no coincide con nadie (o no vino), se cruza por correo o celular:
     - si apuntan a un único participante, `auto` con `cruzadoPor` en `"correo"` o `"celular"`;
     - si apuntan a participantes **distintos**, `conflicto` ("Sin dueño", con los candidatos);
     - si no coincide nadie, `sin_duenio`.
  - `cruzadoPor` (documento, correo, celular o manual) se guarda en la respuesta y se muestra en el panel.
- **Re-cruce**: cada vez que se sube o actualiza la lista, se vuelven a cruzar solo las respuestas `auto`, `sin_duenio` y `conflicto`. Las `manual` y `descartada` **se respetan** (una decisión del admin no se pierde).

## 3. Webhook y Google Apps Script

- **`POST /api/testimonios/webhook`**:
  - El secreto viaja en la cabecera `X-Testimonios-Secret` y se compara con `timingSafeEqual` contra `TESTIMONIOS_WEBHOOK_SECRET`.
  - Sin secreto o con uno incorrecto responde 401. Si la variable no está configurada responde 503 (rechaza todo).
  - El cuerpo se valida con Zod y tiene un límite de tamaño.
  - Los encabezados del formulario se mapean de forma flexible con `headerKey()`, igual que en la importación.
- **Idempotencia**:
  - `clave = sha256(marcaTemporal + "|" + documento + "|" + correo + "|" + enlace)`, con índice único.
  - Si la misma respuesta llega dos veces, devuelve `200 { duplicada: true }` sin crear otra.
  - Se guarda `fila` como referencia, pero no se usa en la clave, porque las filas cambian si borran una.
- **Apps Script** (`docs/testimonios/apps-script.gs`):
  - `alEnviarFormulario(e)`, el activador "Al enviar el formulario".
  - `cargaInicial()` envía todas las filas existentes una vez. Es seguro repetirla gracias a la idempotencia.
  - Reintentos: 3 intentos con espera creciente. Si fallan, la fila queda en una cola (`PropertiesService`) y `reintentarPendientes()` la reenvía; esta función se puede programar cada 10 minutos.
  - La URL y el secreto se guardan en las Propiedades del script, no en el código.
  - **No lo activo**: queda documentado para cuando apruebes.
- **Pruebas en local**: un script simula envíos con datos ficticios hacia el servidor local.

## 4. Lista de participantes (solo admin)

`/admin/testimonios/lista`, igual que "Subir lista":
- Se sube un Excel con Nombres, Apellidos, Celular, Correo, Documento y Ciudad.
- La vista previa muestra nuevos, cambiados, ya no están y errores por fila.
- Se confirma para aplicar y luego se ejecuta el **re-cruce**.
- Se reutilizan `readRowsFromBuffer()` (`src/lib/excel.ts`) y el estilo de `ImportPanel`.
- Los que ya no están en la lista solo se eliminan si el admin los marca. Sus comentarios y respuestas se conservan, pero quedan sin dueño.

## 5. Vistas y permisos

**Permisos nuevos** en `src/lib/permisos.ts`, validados en el servidor con `exigir()`:

| Permiso | Monitor | Coordinador | Admin |
|---|---|---|---|
| `testimonios_ver` / `testimonios_comentar` | sus ciudades | todas | todas |
| `testimonios_subir_lista` | — | — | ✓ |
| `testimonios_sin_duenio` (ver, asignar, descartar) | — | — | ✓ |
| `testimonios_exportar_pendientes` | — | — | ✓ |

**Pantallas** (mismo estilo y estructura que el panel de validación; se reutilizan `AppShell`, `MenuFila` y los estilos del panel):
- **`/testimonios`**: contadores y filtros (Todos, Realizado, Seguimiento, Pendiente), buscador y filtro de ciudad, todo guardado en la URL, con refresco cada 30 s.
  - Cada fila muestra nombre, documento, ciudad, celular y correo, más el enlace del video y la fecha de envío.
  - Los comentarios se abren con un botón y se muestran en orden cronológico con su autor.
- **Orden en "Todos"**: primero Seguimiento (el comentario más reciente primero), luego Pendientes (alfabético) y al final Realizados (el envío más reciente primero).
- **Pendientes**: botón "Copiar lista" (solo Pendientes: nombre y celular, listo para WhatsApp) y botón "Exportar pendientes" (Excel de Pendientes y Seguimiento: Nombre completo, Celular con indicativo, Correo, Documento, Ciudad, Estado y Último comentario; respeta la ciudad filtrada; para todos los roles, monitor solo sus ciudades). *(Ajuste aprobado: reemplaza la vista de impresión.)*
- **Avance testimonios** (coordinación y admin): avance total y tabla por ciudad de menor a mayor avance, con monitor; admin ve además sin dueño y conflictos.
- **Celulares** con indicativo según la ciudad (+57, +507, +593, +598), solo al mostrar y exportar.
- **Admin**:
  - `/admin/testimonios/sin-duenio`: cada respuesta con sus datos originales y sus candidatos. Se puede **asignar** a un participante (con buscador) o **descartar**. Ambas acciones quedan en la auditoría.
  - Botón "Descargar pendientes" (Excel).
  - Subir la lista.
- **Menú**: nueva sección **"Testimonios"**, separada de "Estudiantes", en `AppShell`. El monitor ve "Mi grupo" y "Testimonios".

**APIs**:
- `GET /api/testimonios` (lista con alcance por ciudad).
- `POST /api/testimonios/[id]/comentarios`.
- `GET /api/admin/testimonios/sin-duenio`.
- `POST /api/admin/testimonios/respuestas/[id]` (asignar o descartar).
- `POST /api/admin/testimonios/lista` (vista previa o aplicar).
- `GET /api/admin/testimonios/exportar-pendientes`.
- `POST /api/testimonios/webhook`.

## 6. Archivos principales

- **Nuevos**:
  - `src/lib/testimonios/` (`db.ts` con las colecciones `testimonios_*`, `cruce.ts`, `ciudades.ts`, `importer.ts`, `estado.ts`, `orden.ts`);
  - `src/app/testimonios/**`, `src/app/admin/testimonios/**`, `src/app/api/testimonios/**`, `src/app/api/admin/testimonios/**`;
  - `src/components/Testimonios*.tsx`;
  - `scripts/testimonios-*.ts` (simulación de envíos y semilla de prueba, siempre con la barrera);
  - `tests/testimonios-*.test.ts`;
  - `docs/testimonios/` (Apps Script y guía);
  - `PLAN-testimonios.md`.
- **Cambios mínimos en código existente**, sin cambios de datos:
  - `src/lib/permisos.ts`: permisos nuevos.
  - `src/components/AppShell.tsx`: sección del menú.
  - `src/lib/db.ts`: solo exportar el cliente para que el módulo abra sus colecciones; los índices existentes no se tocan.

## 7. Pasos (aviso al terminar cada uno)

1. **Base**: rama `feature/testimonios`, hook pre-push, barrera, colecciones e índices `testimonios_*`, funciones de normalización y cruce, y pruebas del cruce.
2. **Webhook y Apps Script**: endpoint, idempotencia, código del Apps Script con reintentos, guía de instalación, simulador local y pruebas del webhook.
3. **Lista de participantes**: subida con vista previa y re-cruce.
4. **Vista Testimonios** (monitor y coordinador): estados, filtros, orden, comentarios, copiar y exportar pendientes; avance por ciudad.
5. **Admin**: "Sin dueño" (asignar o descartar con auditoría), Excel de pendientes y pruebas de 403.
6. **Entrega**: capturas en celular y computador de cada rol, y la guía de puesta en producción (variable en Vercel, instalación del Apps Script, carga inicial).

## 8. Verificación

- **Pruebas automáticas (vitest)**:
  - cruce por documento, por correo y por celular (últimos 10);
  - respuesta sin celular;
  - duplicados;
  - conflicto entre dos participantes;
  - re-cruce respetando las asignaciones manuales y descartadas;
  - webhook: sin secreto → 401, secreto incorrecto → 401, sin variable → 503, idempotencia;
  - permisos: el coordinador y el monitor reciben 403 en subir lista, "Sin dueño", asignar, descartar y exportar pendientes; un monitor no puede ver ni comentar participantes de otra ciudad;
  - la prueba de "solo escribe en `testimonios_*`".
- **Manual**: `mongod` local en `127.0.0.1:27099` con datos ficticios y el servidor arrancado con el lanzador protegido. Allí pruebo cada rol en celular y computador con capturas, y el simulador de envíos del Sheet.
- **Al cerrar cada paso**: se borran la base local, el perfil de Chrome y los temporales.

## 9. Puntos a confirmar más adelante

- La pregunta del Form es **"Número de WhatsApp o Celular"**. El mapeo también acepta variantes ("Celular", "WhatsApp"…).
- La clave de idempotencia usa los enlaces ordenados y unidos, así que el mismo envío con varios enlaces no se duplica.
- El **video** se muestra como enlace a Drive; no se descarga ni se previsualiza.
- **La orden de subir a producción la das tú.** Hasta entonces nada sale del equipo.
