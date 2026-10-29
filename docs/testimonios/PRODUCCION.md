# Testimonios · Guía para pasar a producción

Esta guía sube el módulo de testimonios a **validacion.tocaunavida.org** sin tocar la validación de estudiantes.
Síguela en orden. Cada paso dice cómo comprobar que salió bien antes de seguir.

Para instalar el Apps Script en la hoja de respuestas hay una guía aparte: [INSTALACION.md](INSTALACION.md) (paso 6 de esta guía).

---

## Qué cambia en producción (y qué no)

| | |
|---|---|
| **Colecciones nuevas** | `testimonios_participantes`, `testimonios_respuestas`, `testimonios_comentarios` y `testimonios_auditoria`. Se crean solas, con sus índices, la primera vez que alguien abre Testimonios. |
| **Colecciones existentes** | **No se modifican.** `students`, `changeLog`, `rateLimits` y `sesiones` no se usan. De `users` solo se **lee**: el rol y las ciudades al iniciar sesión (como hoy) y el nombre de los monitores para el "Avance testimonios". |
| **Migraciones** | Ninguna. |
| **Variables nuevas en Vercel** | Solo `TESTIMONIOS_WEBHOOK_SECRET`. |
| **Lo que cambia para cada rol** | Aparecen nuevas secciones en el menú. Las pantallas de validación siguen igual. |

Dos pruebas automáticas vigilan la regla de los datos: fallan si el código del módulo usa una colección que no empiece por `testimonios_`, o si la lectura de `users` llega a escribir (`tests/testimonios-seguridad.test.ts`).

### Qué ve cada rol

| Sección | Monitor | Coordinación | Admin |
|---|---|---|---|
| **Testimonios**: lista con estados, comentarios, "Copiar lista" y "Exportar pendientes" | sus ciudades | todas | todas |
| **Avance testimonios**: avance por ciudad | — | ✓ | ✓, y además las respuestas sin dueño |
| **Lista testimonios**: subir la lista de participantes | — | — | ✓ |
| **Sin dueño**: asignar o descartar respuestas | — | — | ✓ |

El servidor valida los permisos en cada pedido; ocultar un botón es solo comodidad. Por ejemplo, un monitor que pida el Excel de otra ciudad recibe 403.

Las capturas de cada pantalla, en computador y celular, no están en el repositorio: se guardan aparte (`docs/testimonios/capturas/` está en `.gitignore`).

---

## 0. Antes de empezar

- [ ] Autorizaste fusionar `feature/testimonios` con `main`. Hasta ahora todo está solo en commits locales.
- [ ] (Recomendado) Toma un snapshot de la base en Atlas: **Clusters → ⋯ → Back Up → Take Snapshot Now**. El módulo no toca los datos existentes, pero así hay un punto de regreso.
- [ ] En el Google Form ya está la pregunta **"Número de WhatsApp o Celular"**. Las respuestas anteriores, que no la tienen, se cruzan por documento o correo.
- [ ] Tienes a mano el Excel de participantes con las columnas **Nombres, Apellidos, Celular, Correo, Documento y Ciudad**.

## 1. Crear el secreto del webhook

En PowerShell, en cualquier carpeta:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copia el resultado. Es el **mismo valor** que va en Vercel (paso 2) y en el Apps Script (paso 6). No lo guardes en el repositorio, en un correo ni en un chat; un gestor de contraseñas está bien.

> El webhook rechaza todo (503) si la variable falta o tiene menos de 24 caracteres. Así, aunque el código llegue a producción antes de tiempo, no recibe nada.

## 2. Configurar la variable en Vercel

1. Vercel → el proyecto que despliega el fork `Cristian10-24/validacion_jc` → **Settings → Environment Variables → Add New**.
2. **Key:** `TESTIMONIOS_WEBHOOK_SECRET` · **Value:** el secreto del paso 1 · **Environments:** solo **Production**.
   - No la actives en **Preview**: Vercel crea un despliegue de vista previa por cada rama que se sube, y esos despliegues no deben recibir respuestas del Form.
3. Guarda. La variable se aplica en el próximo despliegue (paso 3).

**Comprobar:** la variable aparece en la lista con el ambiente *Production*.

## 3. Fusionar y desplegar

En `C:\ROFÉ\PAGINAS\validation-jc` (rama `main`):

```powershell
git status                      # debe estar limpio (solo .claude/ sin seguimiento)
git merge --squash feature/testimonios   # todo el módulo en un solo cambio (sin el historial de la rama)
git commit -m "Módulo de testimonios"
npm install                     # no hay dependencias nuevas; es por seguridad
npm test                        # las 154 pruebas deben pasar
npm run build                   # debe terminar sin errores
git push                        # origin envía a Fundacion-ROFE y al fork; Vercel despliega main
```

> El hook local `pre-push` solo bloquea la rama `feature/testimonios`; `main` se sube normal.
> La rama `feature/testimonios` **no** se sube: así Vercel no crea un despliegue de vista previa con ella.
> Se usa `--squash` para que a `main` llegue un solo commit con el estado final: los commits intermedios de la rama (por ejemplo, el que tenía las capturas) no se publican.

**Comprobar** en Vercel → **Deployments**: el despliegue de `main` termina en **Ready**.

## 4. Revisar que la app responde

1. Entra a https://validacion.tocaunavida.org con tu usuario de **admin**.
2. En el menú deben aparecer **Testimonios, Avance testimonios, Lista testimonios y Sin dueño**.
3. **Resumen** y **Estudiantes** muestran los mismos números que antes del despliegue.
4. **Testimonios** dice "Sin participantes". Es lo esperado: la lista aún no se ha subido.

Si algo de la validación se ve distinto, detente y revierte (ver [Volver atrás](#volver-atrás)).

## 5. Subir la lista de participantes

1. **Lista testimonios** → elige o arrastra el Excel (o CSV). La vista previa sale sola y todavía no guarda nada.
2. Revisa los errores por fila. Cada fila necesita documento, nombre y una ciudad del catálogo; "Paysandú" y "Colonia" se guardan como Uruguay.
3. **Aplicar cambios → Sí, aplicar**. La primera vez todos aparecen como *nuevos*.

**Comprobar:** en **Avance testimonios** aparecen las ciudades con todos en Pendiente y, en cada fila, su monitor.

## 6. Instalar el Apps Script y hacer la carga inicial

Sigue [INSTALACION.md](INSTALACION.md):

1. Pega el código en la hoja de respuestas (**Extensiones → Apps Script**).
2. Configura las propiedades:
   - `TESTIMONIOS_URL` = `https://validacion.tocaunavida.org/api/testimonios/webhook`
   - `TESTIMONIOS_SECRETO` = el secreto del paso 1
   - `HOJA_RESPUESTAS` = el nombre exacto de la pestaña de respuestas (p. ej. `Testimonio-2026`)
3. Ejecuta **`probarConexion`**: debe nombrar la pestaña con sus 7 columnas y decir *"Conexión correcta (secreto aceptado)"*.
4. Ejecuta **`cargaInicial`**: envía todas las respuestas que ya existen. Repetirla no duplica nada.
5. Crea los activadores:
   - **`alEnviarFormulario`** (Al enviar el formulario);
   - **`reintentarPendientes`** (cada 10 minutos).

**Comprobar:**
- En **Avance testimonios** suben los *Realizados*.
- En **Sin dueño** quedan solo las respuestas que no se pudieron asignar solas. Revísalas: asígnalas o descártalas.
- Envía una respuesta de prueba en el Form con un documento de la lista. En menos de un minuto ese participante pasa a **Realizado**. Después descarta esa respuesta de prueba en **Sin dueño**, o déjala si es real.

## 7. Avisar al equipo

- **Monitores:** en el menú tienen **Testimonios**, solo con sus ciudades. Ahí pueden:
  - comentar y editar sus propios comentarios. Un pendiente con comentarios sigue Pendiente y lleva la etiqueta amarilla "Con comentarios";
  - copiar la lista de todos los pendientes para WhatsApp;
  - exportar a Excel a todos los pendientes, con la columna "Con comentarios" (Sí/No) y su último comentario.
- **Coordinación:** tiene además **Avance testimonios**, por ciudad, de menor a mayor avance.

---

## Mantenimiento

- **Lista actualizada:** súbela otra vez en **Lista testimonios**. La vista previa muestra quiénes son nuevos, quiénes cambiaron y quiénes ya no están; a los que ya no están solo se los borra si los marcas. Las respuestas se vuelven a cruzar solas, y lo que asignaste o descartaste a mano en Sin dueño se respeta.
- **Auditoría:** cada subida de lista, asignación y descarte queda en `testimonios_auditoria` (quién, cuándo y el detalle).
- **Cambiar el secreto:** genera uno nuevo y cámbialo en Vercel, vuelve a desplegar y actualiza `TESTIMONIOS_SECRETO` en el Apps Script. Las respuestas que fallen mientras tanto quedan en la cola del script y salen con `reintentarPendientes`.

## Volver atrás

De menor a mayor impacto:

1. **Detener la llegada de respuestas:** en Apps Script → **Activadores**, elimina `alEnviarFormulario`. También sirve borrar la variable `TESTIMONIOS_WEBHOOK_SECRET` en Vercel y volver a desplegar: el webhook responde 503. Las respuestas siguen guardándose en la hoja, y luego se reenvían con `cargaInicial` sin duplicar.
2. **Quitar el módulo de la app:** en `main`, `git revert <commit "Módulo de testimonios">`, luego `git push`. La validación queda exactamente como antes.
3. **Borrar los datos del módulo** (solo si se decide no usarlo): en Atlas, elimina las cuatro colecciones `testimonios_*`. Ninguna otra colección depende de ellas.

## Desarrollo local (para cambios futuros)

Nunca contra Atlas: el lanzador se niega a arrancar si la URI no es local o si la base es `validacion_jc`.

```powershell
# mongod local en 127.0.0.1:27099 y, en otra terminal:
$env:MONGODB_URI = "mongodb://127.0.0.1:27099"; $env:MONGODB_DB = "testimonios_pruebas"
$env:SESSION_SECRET = "<cualquier texto de 16+ caracteres>"; $env:TESTIMONIOS_WEBHOOK_SECRET = "<24+ caracteres>"
npm run dev:local-testimonios    # http://localhost:3200
```

`scripts/testimonios-simular.ts` carga participantes ficticios en esa base local y envía respuestas de prueba al webhook local.
