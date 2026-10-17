# Sodimusic Backend

API de Sodimusic Company con Hono + Prisma + PostgreSQL + JWT.

## Requisitos

- Node.js 20+
- npm 10+
- Base de datos PostgreSQL accesible

## Variables de entorno

Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

Variables clave:

- `DATABASE_URL`: URL vía pooler (ej. Supabase + PgBouncer).
- `DIRECT_URL`: conexión directa para migraciones Prisma.
- `PORT`: puerto de la API (`4000` por defecto).
- `FRONTEND_URL`: origen permitido por CORS.
- `JWT_SECRET`: clave para firmar tokens admin.
- `BLOB_READ_WRITE_TOKEN` (opcional): token del store Vercel Blob `sodimusic-media` para guardar los archivos subidos desde el admin. Sin él, se guardan en Postgres (tabla `MediaAsset`).
- `RESEND_API_KEY` (opcional): envío de correos (sesiones, contacto, bienvenida al newsletter). Sin ella solo se registra en el log.
- `API_URL` (opcional): URL pública de esta API, usada en el enlace de baja del correo de bienvenida. Si falta, se deduce de la petición (`x-forwarded-proto`/`host`).
- `RATE_LIMIT_DISABLED=1` (opcional): desactiva el rate limit de los formularios públicos (lo usan los tests de integración).

## Formularios públicos: rate limit y newsletter

`POST /api/newsletter/subscribe`, `POST /api/contact/messages`, `POST /api/contact/beat-interest` y `POST /api/booking/sessions` llevan un rate limit en memoria por IP (`x-forwarded-for`, luego `x-real-ip`): **10 peticiones cada 10 minutos**; al superarlo responden `429` con `{ ok|success: false, error: "Demasiadas solicitudes. Inténtalo de nuevo en unos minutos." }` y cabecera `Retry-After` (`src/lib/rate-limit.ts`). En serverless el contador es por instancia.

Newsletter (`src/lib/newsletter-token.ts`):

- `POST /api/newsletter/subscribe` responde **siempre `201 { ok: true }`** (nuevo, reactivado o ya suscrito: no revela si el correo existía). Si hay `RESEND_API_KEY`, envía un correo de bienvenida con el enlace de baja cuando el alta es nueva o reactiva una baja.
- El token de baja es `HMAC-SHA256(email, JWT_SECRET)` en hex truncado a 32 caracteres; no se guarda en BD.
- `POST /api/newsletter/unsubscribe` con `{ email, token }`: responde `200 { ok: true }` siempre, pero solo aplica la baja si el token coincide. Sin `token` → `400`.
- `GET /api/newsletter/unsubscribe?email=&token=` (enlace de los correos): aplica la baja y redirige (`302`) a `${FRONTEND_URL}/legal/privacidad?baja=ok` (o `?baja=error` si el token no es válido).

Las exportaciones CSV del admin (`/api/admin/subscribers/export`, `/api/admin/sessions/export.csv`) neutralizan celdas que empiezan por `=`, `+`, `-`, `@`, tabulador o CR anteponiendo `'` (`src/lib/csv.ts`).

## Caché de respuestas públicas

`GET /api/site-config` y los listados que edita el admin (`/api/beats`, `/api/products`, `/api/releases`, `/api/productions`, `/api/channels`) responden `Cache-Control: public, max-age=0, s-maxage=0, must-revalidate`: Next cachea por tags y revalida al publicar; el CDN no retiene nada. Solo `GET /uploads/:name` lleva `max-age=31536000, immutable`.

Paginación (`src/lib/query.ts`): `page` y `pageSize` deben ser enteros seguros (`page` ≤ 100000); valores inválidos caen a página 1 / tamaño por defecto. `q` elimina `%` y `_` y se recorta a 80 caracteres.

## Ejecutar local

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

API disponible en `http://localhost:4000`.

## Build

```bash
npm run build
npm run start
```

## Tienda (productos)

Modelo `Product` (merch): `name`, `slug` único, `priceCOP`, `compareAtCOP`, `category`, `images[]`, `sizes[]`, `stock`, `status` (`ACTIVE` | `DRAFT` | `SOLD_OUT`), `featured`, `sortOrder`.

- Público: `GET /api/products` (oculta `DRAFT`; query `category`, `featured=1`, `page`, `pageSize` ≤ 48; devuelve `{ items, total, page, pageSize, categories }`) y `GET /api/products/by-slug/:slug`.
- Admin (JWT): `GET/POST /api/admin/products`, `PATCH/DELETE /api/admin/products/:id`. Si no envías `slug`, se genera desde `name` (`slugify`) y se desambigua con `-2`, `-3`… El panel (`/api/admin/dashboard/stats`) incluye `productsActive`.
- Validación en `src/schemas/product.ts`; slug en `src/lib/slugify.ts`.

## Uploads (archivos del admin)

`POST /api/admin/upload` (multipart, campo `file`) acepta `image/jpeg|png|webp|gif` y `audio/mpeg|wav`, con un máximo de **4,5 MB** (límite del body en funciones de Vercel). El disco de la función es efímero, así que nunca se escribe en él:

- Con `BLOB_READ_WRITE_TOKEN`: se sube a Vercel Blob (`uploads/<uuid>.<ext>`, acceso público) y la respuesta `{ url }` es una URL absoluta.
- Sin token: se guarda en la tabla `MediaAsset` y la respuesta es `/uploads/<uuid>.<ext>`, servida por `GET /uploads/:name` con caché inmutable de 1 año.

Los campos de imagen (`coverUrl`, `images[]`, etc.) aceptan URLs `http(s)` o rutas `/uploads/...`. En desarrollo, `GET /uploads/:name` también sirve archivos antiguos de la carpeta `uploads/`.

## Migraciones y despliegue en Vercel

El `buildCommand` de Vercel es `npm run db:generate && npm run db:deploy && npm run build`. `db:deploy` (`scripts/migrate-deploy.mjs`) ejecuta `prisma migrate deploy` y:

- Si la BD ya tenía tablas pero sin historial (`P3005`), marca como aplicadas las migraciones base (`init`, `blocked_date_scope`, `page_view`) y reintenta.
- Si la BD no es alcanzable desde el build (`P1001`, red, timeout), avisa y continúa con código 0: las tablas de tienda, media, canales, CRM y `AppMeta`, y las columnas v3, se crean en runtime con `ensureShopSchema()` (`src/lib/ensure-schema.ts`, SQL idempotente que no lanza en una BD vacía) la primera vez que se usa una ruta que las necesita.
- Si una migración falla con `P3018` y el error de BD es `already exists` (el runtime ya creó esas tablas antes del build), la marca como aplicada con `prisma migrate resolve --applied <nombre>` y reintenta (máx. 3 veces). Si hay una migración registrada como fallida (`P3009`), la marca como revertida (`--rolled-back`) y la reaplica. Las migraciones `products_and_media`, `v3_legal_channels_crm` y `app_meta` son idempotentes (`IF NOT EXISTS`), así que reaplicarlas sobre una BD donde `ensureShopSchema()` ya corrió no falla.
- Cualquier otro error aborta el build.

`PRISMA_SCHEMA_PATH` (opcional) permite apuntar el script a otro `schema.prisma` (lo usan los tests de `src/schema-migrations.integration.test.ts`, que crean BD temporales con `psql`).

La migración de `youtube.channels` del SiteConfig a la tabla `YoutubeChannel` se hace una sola vez: deja el flag `youtubeChannelsMigratedAt` en `AppMeta` y vacía `youtube.channels` en `publishedJson`/`draftJson`. Borrar todos los canales en el admin no los vuelve a crear.

Para una BD existente sin historial también puedes usar `scripts/prisma-baseline-existing-db.sh`.

## Notas de separación de repos

Este backend es autocontenido y puede vivir en su propio repositorio sin depender del `package.json` de la raíz.
