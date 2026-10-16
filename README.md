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
- Si la BD no es alcanzable desde el build (`P1001`, red, timeout), avisa y continúa con código 0: las tablas `Product` y `MediaAsset` se crean en runtime con `ensureShopSchema()` (`src/lib/ensure-schema.ts`, SQL idempotente) la primera vez que se usa una ruta de tienda o de uploads.
- Cualquier otro error aborta el build.

Para una BD existente sin historial también puedes usar `scripts/prisma-baseline-existing-db.sh`.

## Notas de separación de repos

Este backend es autocontenido y puede vivir en su propio repositorio sin depender del `package.json` de la raíz.
