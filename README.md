# Sodimusic_backend

API de Sodimusic Company con Hono + Prisma + PostgreSQL + JWT.

Repositorio: [github.com/JaydethSp01/Sodimusic_backend](https://github.com/JaydethSp01/Sodimusic_backend)

## Requisitos

- Node.js 20+
- npm 10+
- PostgreSQL accesible

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
- `JWT_SECRET`: clave para firmar tokens admin (mismo valor que `NEXTAUTH_SECRET` del frontend).

## Ejecutar local

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

API en `http://localhost:4000`.

## Build y tests

```bash
npm run build
npm run test
```

## QA (scripts/)

```bash
npm run qa:automated
```
