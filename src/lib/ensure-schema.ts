import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma.js";
import { publishedContent } from "./site-config-db.js";
import { ensureSocialSources } from "./social/sync.js";
import { artistSeedsFromContent } from "./artists.js";

/** Clave en AppMeta que marca que `youtube.channels` del SiteConfig ya se migró a YoutubeChannel. */
export const CHANNELS_MIGRATED_KEY = "youtubeChannelsMigratedAt";

/** `ALTER TABLE` solo si la tabla existe (en una BD vacía las migraciones base aún no corrieron). */
function alterIfExists(table: string, alter: string): string {
  return `DO $$ BEGIN IF to_regclass('public."${table}"') IS NOT NULL THEN ${alter}; END IF; END $$;`;
}

/**
 * SQL idempotente equivalente a las migraciones `products_and_media`, `v3_legal_channels_crm`, `app_meta`, `social_feed` y `artists`.
 * El build de Vercel puede no alcanzar la BD (IPv6/pooler), así que las tablas y columnas
 * nuevas se garantizan también en runtime antes de usarlas. En una BD vacía no lanza.
 */
export const SHOP_SCHEMA_SQL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "priceCOP" INTEGER NOT NULL,
    "compareAtCOP" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'Merch',
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stock" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "MediaAsset" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug")`,
  `CREATE INDEX IF NOT EXISTS "Product_status_idx" ON "Product"("status")`,
  `CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category")`,
  `CREATE INDEX IF NOT EXISTS "Product_featured_idx" ON "Product"("featured")`,
  `CREATE INDEX IF NOT EXISTS "Product_sortOrder_idx" ON "Product"("sortOrder")`,
  alterIfExists("SiteConfig", `ALTER TABLE "SiteConfig" ALTER COLUMN "id" SET DEFAULT 'default'`),

  // ---- v3: columnas nuevas en modelos existentes (solo si la tabla ya existe) ----
  alterIfExists("Beat", `ALTER TABLE "Beat" ADD COLUMN IF NOT EXISTS "priceMp3COP" INTEGER`),
  alterIfExists("Beat", `ALTER TABLE "Beat" ADD COLUMN IF NOT EXISTS "priceWavCOP" INTEGER`),
  alterIfExists("Beat", `ALTER TABLE "Beat" ADD COLUMN IF NOT EXISTS "priceStemsCOP" INTEGER`),
  alterIfExists("Beat", `ALTER TABLE "Beat" ADD COLUMN IF NOT EXISTS "priceExclusiveCOP" INTEGER`),
  alterIfExists("BookingSession", `ALTER TABLE "BookingSession" ADD COLUMN IF NOT EXISTS "policyAcceptedAt" TIMESTAMP(3)`),
  alterIfExists("BookingSession", `ALTER TABLE "BookingSession" ADD COLUMN IF NOT EXISTS "policyVersion" TEXT`),
  alterIfExists(
    "BookingSession",
    `ALTER TABLE "BookingSession" ADD COLUMN IF NOT EXISTS "marketingOptIn" BOOLEAN NOT NULL DEFAULT false`,
  ),
  alterIfExists("BookingSession", `ALTER TABLE "BookingSession" ADD COLUMN IF NOT EXISTS "isAdult" BOOLEAN`),
  alterIfExists("Release", `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "appleUrl" TEXT`),
  alterIfExists("Release", `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "deezerUrl" TEXT`),
  alterIfExists("Release", `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "amazonUrl" TEXT`),
  alterIfExists("Release", `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "tidalUrl" TEXT`),
  alterIfExists("Release", `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "soundcloudUrl" TEXT`),
  alterIfExists("Release", `ALTER TABLE "Release" ADD COLUMN IF NOT EXISTS "releaseDate" TIMESTAMP(3)`),

  // ---- v3: tablas nuevas ----
  `CREATE TABLE IF NOT EXISTS "YoutubeChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "channelId" TEXT,
    "handle" TEXT,
    "description" TEXT,
    "avatarUrl" TEXT,
    "featuredVideoUrl" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Crew',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "YoutubeChannel_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "BeatInterest" (
    "id" TEXT NOT NULL,
    "beatId" TEXT,
    "beatTitle" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "instagram" TEXT,
    "message" TEXT,
    "exclusiveIntent" BOOLEAN NOT NULL DEFAULT false,
    "licenseType" TEXT,
    "policyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BeatInterest_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "ContactMessage" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "policyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactMessage_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'footer',
    "policyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "YoutubeChannel_status_featured_sortOrder_idx" ON "YoutubeChannel"("status", "featured", "sortOrder")`,
  `CREATE INDEX IF NOT EXISTS "BeatInterest_createdAt_idx" ON "BeatInterest"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Subscriber_email_key" ON "Subscriber"("email")`,

  // ---- metadatos de la app (flags de migración de datos) ----
  `CREATE TABLE IF NOT EXISTS "AppMeta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppMeta_pkey" PRIMARY KEY ("key")
  )`,

  // ---- feed social "Novedades" (migración social_feed) ----
  `CREATE TABLE IF NOT EXISTS "SocialSource" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialSource_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "url" TEXT NOT NULL,
    "imageUrl" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'VISIBLE',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SocialSource_kind_externalId_key" ON "SocialSource"("kind", "externalId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "SocialPost_externalId_key" ON "SocialPost"("externalId")`,
  `CREATE INDEX IF NOT EXISTS "SocialPost_status_pinned_publishedAt_idx" ON "SocialPost"("status", "pinned", "publishedAt")`,

  // ---- artistas (migración artists) ----
  `CREATE TABLE IF NOT EXISTS "Artist" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Artista',
    "shortBio" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "coverUrl" TEXT,
    "city" TEXT,
    "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "spotifyUrl" TEXT,
    "instagramUrl" TEXT,
    "youtubeUrl" TEXT,
    "tiktokUrl" TEXT,
    "facebookUrl" TEXT,
    "appleUrl" TEXT,
    "youtubeChannelId" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Artist_slug_key" ON "Artist"("slug")`,
  `CREATE INDEX IF NOT EXISTS "Artist_status_featured_sortOrder_idx" ON "Artist"("status", "featured", "sortOrder")`,
];

/** Ejecuta el SQL idempotente de tienda/media/v3/AppMeta contra `client`. No lanza en una BD vacía. */
export async function applyShopSchema(client: PrismaClient = prisma): Promise<void> {
  for (const sql of SHOP_SCHEMA_SQL) {
    try {
      await client.$executeRawUnsafe(sql);
    } catch (err) {
      // Dos instancias (o dos ficheros de test) ejecutando `CREATE … IF NOT EXISTS` a la vez pueden chocar
      // en pg_type/pg_class ("duplicate key" / "already exists"): el objeto ya existe, seguimos.
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|duplicate key|pg_type_typname_nsp_index|pg_class_relname_nsp_index/i.test(msg)) continue;
      throw err;
    }
  }
}

/** Devuelve una copia del JSON con `youtube.channels = []` (si el JSON tiene sección youtube). */
function withEmptyChannels(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const obj = json as Record<string, unknown>;
  const yt = obj["youtube"];
  if (!yt || typeof yt !== "object" || Array.isArray(yt)) return json;
  return { ...obj, youtube: { ...(yt as Record<string, unknown>), channels: [] } };
}

async function markChannelsMigrated(client: PrismaClient, at: Date): Promise<void> {
  await client.appMeta.upsert({
    where: { key: CHANNELS_MIGRATED_KEY },
    create: { key: CHANNELS_MIGRATED_KEY, value: at.toISOString() },
    update: { value: at.toISOString() },
  });
}

/**
 * Migra `youtube.channels` del SiteConfig publicado a la tabla `YoutubeChannel` UNA sola vez:
 * - Si `AppMeta.youtubeChannelsMigratedAt` existe, no hace nada (aunque la tabla esté vacía:
 *   borrar todos los canales en el admin no los "resucita").
 * - Si la tabla ya tiene canales, solo marca el flag.
 * - Si migra, vacía `youtube.channels` en publishedJson/draftJson y marca el flag.
 * Los canales migrados quedan como destacados y conservan su orden.
 */
export async function migrateChannelsFromSiteConfig(client: PrismaClient = prisma): Promise<number> {
  const flag = await client.appMeta.findUnique({ where: { key: CHANNELS_MIGRATED_KEY } });
  if (flag) {
    return 0;
  }
  const now = new Date();
  const count = await client.youtubeChannel.count();
  if (count > 0) {
    await markChannelsMigrated(client, now);
    return 0;
  }
  const row = await client.siteConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    return 0;
  }
  const channels = publishedContent(row).youtube.channels;
  let migrated = 0;
  if (Array.isArray(channels) && channels.length > 0) {
    const result = await client.youtubeChannel.createMany({
      data: channels.map((ch, i) => ({
        name: ch.name,
        url: ch.url,
        channelId: ch.channelId?.trim() || null,
        handle: null,
        description: ch.description?.trim() || null,
        avatarUrl: ch.avatarUrl?.trim() || null,
        featuredVideoUrl: ch.featuredVideoUrl?.trim() || null,
        category: "Sello",
        featured: true,
        status: "ACTIVE",
        sortOrder: i,
      })),
    });
    migrated = result.count;
  }
  await client.siteConfig.update({
    where: { id: "default" },
    data: {
      publishedJson: withEmptyChannels(row.publishedJson) as object,
      draftJson: withEmptyChannels(row.draftJson) as object,
    },
  });
  await markChannelsMigrated(client, now);
  return migrated;
}

/** Clave en AppMeta que marca que los artistas del SiteConfig ya se sembraron en la tabla Artist. */
export const ARTISTS_SEEDED_KEY = "artistsSeededAt";

async function markArtistsSeeded(client: PrismaClient, at: Date): Promise<void> {
  await client.appMeta.upsert({
    where: { key: ARTISTS_SEEDED_KEY },
    create: { key: ARTISTS_SEEDED_KEY, value: at.toISOString() },
    update: { value: at.toISOString() },
  });
}

/**
 * Siembra la tabla `Artist` desde `artists.*` del SiteConfig publicado UNA sola vez (flag `AppMeta.artistsSeededAt`):
 * - `producerName/Genres/Bio/ImageUrl` → rol "Productor principal", destacado, sortOrder 0.
 * - cada `members[]` → rol `member.role ?? "Crew"`, géneros = split de `genre` por "·", shortBio = `bio`, redes.
 * El slug es `slugify(name)`; si ya existe (o se repite el nombre) no se duplica.
 * Si el flag existe, no hace nada (borrar artistas en el admin no los "resucita").
 * El SiteConfig no se modifica: la página /artists sigue usando sus textos de cabecera.
 */
export async function seedArtistsFromSiteConfig(client: PrismaClient = prisma): Promise<number> {
  const flag = await client.appMeta.findUnique({ where: { key: ARTISTS_SEEDED_KEY } });
  if (flag) {
    return 0;
  }
  const now = new Date();
  const row = await client.siteConfig.findUnique({ where: { id: "default" } });
  const content = publishedContent(row);
  const seeds = artistSeedsFromContent(content);
  const existing = await client.artist.findMany({ select: { slug: true } });
  const taken = new Set(existing.map((a) => a.slug));
  let seeded = 0;
  for (const seed of seeds) {
    if (taken.has(seed.slug)) continue;
    taken.add(seed.slug);
    await client.artist.create({ data: seed });
    seeded += 1;
  }
  await markArtistsSeeded(client, now);
  return seeded;
}

let shopSchemaReady: Promise<void> | null = null;

/**
 * Garantiza (una vez por instancia) que existen las tablas de tienda, media, canales, CRM, AppMeta, feed social y artistas,
 * y las columnas v3 de Beat/Release/BookingSession; después migra los canales del SiteConfig
 * si aún no se hizo, siembra los artistas desde el SiteConfig y las fuentes del feed social (flags en AppMeta).
 * Si falla, se descarta la promesa memoizada para reintentar en la siguiente petición
 * y el error se propaga al `onError` de Hono.
 */
export function ensureShopSchema(): Promise<void> {
  if (!shopSchemaReady) {
    shopSchemaReady = (async () => {
      await applyShopSchema(prisma);
      try {
        const migrated = await migrateChannelsFromSiteConfig(prisma);
        if (migrated > 0) {
          console.log(`[schema] ${migrated} canal(es) migrados de SiteConfig a YoutubeChannel`);
        }
      } catch (err) {
        // No bloquea el arranque: los canales se pueden crear desde el admin.
        console.warn("[schema] no se pudieron migrar los canales del SiteConfig", err);
      }
      try {
        const seeded = await seedArtistsFromSiteConfig(prisma);
        if (seeded > 0) {
          console.log(`[schema] ${seeded} artista(s) sembrados desde el SiteConfig`);
        }
      } catch (err) {
        // No bloquea el arranque: los artistas se pueden crear desde el admin.
        console.warn("[schema] no se pudieron sembrar los artistas desde el SiteConfig", err);
      }
      try {
        const seeded = await ensureSocialSources(prisma);
        if (seeded > 0) {
          console.log(`[schema] ${seeded} fuente(s) del feed social sembradas`);
        }
      } catch (err) {
        // No bloquea el arranque: las fuentes se pueden crear desde el admin o en la sincronización.
        console.warn("[schema] no se pudieron sembrar las fuentes del feed social", err);
      }
    })().catch((err: unknown) => {
      shopSchemaReady = null;
      throw err;
    });
  }
  return shopSchemaReady;
}
