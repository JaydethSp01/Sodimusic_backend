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

## Notas de separación de repos

Este backend es autocontenido y puede vivir en su propio repositorio sin depender del `package.json` de la raíz.
