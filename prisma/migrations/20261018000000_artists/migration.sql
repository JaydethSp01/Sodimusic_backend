-- Artistas del sello (idempotente: ensureShopSchema() puede haber creado esta tabla en runtime)

-- CreateTable
CREATE TABLE IF NOT EXISTS "Artist" (
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
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Artist_slug_key" ON "Artist"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Artist_status_featured_sortOrder_idx" ON "Artist"("status", "featured", "sortOrder");
