# Clausura y EXPOFeria: puesta en producción

## 1. Variables de entorno (Vercel → Settings → Environment Variables, solo Production)

| Variable | Valor | Para qué |
|---|---|---|
| `CLAUSURA_HOST` | `clausura.tocaunavida.org` | Activa el subdominio exclusivo para estudiantes. Vacía = el subdominio no hace nada especial. |

No hace falta nada más. La cookie del estudiante usa `SESSION_SECRET`, que ya existe. Los enlaces del calendario (.ics y Google Calendar) y de las portadas son relativos o no dependen del dominio, así que funcionan igual en los dos dominios. `APP_URL` solo la usa el script para imprimir el enlace final.

Después de crear la variable: **Deployments → Redeploy** del último despliegue de `main`.

## 2. Dominio en Vercel y DNS

1. Vercel → proyecto → **Settings → Domains → Add**: `clausura.tocaunavida.org`, asignado a **Production**, sin redirección.
2. En el DNS de `tocaunavida.org`, crea un registro **CNAME**:
   - Nombre/host: `clausura`
   - Valor: el que muestre Vercel en ese momento (normalmente `cname.vercel-dns.com`; usa el que diga Vercel).
3. Espera "Valid Configuration" en Vercel (el certificado HTTPS se crea solo).

## 3. Qué funciona en cada dominio

| | `clausura.tocaunavida.org` (estudiantes) | `validacion.tocaunavida.org` (como siempre) |
|---|---|---|
| `/` | redirige a `/clausura` | portada de validación |
| `/clausura`, `/clausura/<evento>` | formulario de la clausura | también funciona |
| `/login`, `/admin`, `/monitor`, `/testimonios`, `/encuesta`, `/clausura/panel`, `/clausura/resumen`, `/clausura/eventos`, APIs del panel | redirigen a `/clausura` | sin cambios |

Lo controla `src/proxy.ts` con la lógica de `src/lib/clausura/subdominio.ts` (pruebas en `tests/clausura-subdominio.test.ts`).

## 4. Eventos en la base de producción

Desde la carpeta principal (usa `.env.local`, que apunta a producción). **Primero siempre la simulación**: muestra si el evento ya existe y cuántos estudiantes hay de cada ciudad, sin escribir nada.

```bash
npm run clausura:evento -- eventos/cali.json --dry-run
npm run clausura:evento -- eventos/cartagena.json --dry-run
```

Si dice `Estudiantes de Cali: 0` o `No hay estudiantes con la ciudad…`, los estudiantes no están cargados: súbelos con **Subir lista** (admin) o `npm run import -- archivo.xlsx --dry-run` y luego sin `--dry-run`.

Datos cargados en los JSON: Cali sábado 14 (llegada 8:30 a. m., evento 9:00 a. m.–12:00 p. m.) y Cartagena jueves 19 (llegada 2:30 p. m., evento 3:00–5:00 p. m.); fecha límite de ambos: lunes 9 de noviembre, 11:59 p. m. (hora de Colombia). Para publicar:

```bash
npm run clausura:evento -- eventos/cali.json --estado=abierto --confirmar
npm run clausura:evento -- eventos/cartagena.json --estado=abierto --confirmar
```

Si el evento ya existía, el mismo comando lo actualiza (por ejemplo, deja Cali en `proyecto: "no"`). También se puede crear, editar, abrir y cerrar desde **Eventos clausura** en el panel (solo admin).

## 5. Comprobar después del despliegue

- `https://clausura.tocaunavida.org/` → termina en `/clausura`.
- `https://clausura.tocaunavida.org/login` → termina en `/clausura`.
- `https://validacion.tocaunavida.org/` y `/login` → iguales que antes.
- Con un documento real de prueba (de alguien que te autorice), entrar y salir sin enviar.

## 6. Volver atrás

Borrar `CLAUSURA_HOST` en Vercel y redeploy: el subdominio deja de filtrar rutas. Cerrar un evento: `npm run clausura:evento -- --slug=<slug> --estado=cerrado --confirmar` o el botón "Cerrar" en Eventos clausura.
