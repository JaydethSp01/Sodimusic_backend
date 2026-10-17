-- Idempotente: ensureShopSchema() (runtime) puede haber creado estas tablas/columnas antes
-- de que el build de Vercel llegue a `prisma migrate deploy` (evita P3018 "already exists").

-- AlterTable
ALTER TABLE "Beat"
  ADD COLUMN IF NOT EXISTS "priceExclusiveCOP" INTEGER,
  ADD COLUMN IF NOT EXISTS "priceMp3COP" INTEGER,
  ADD COLUMN IF NOT EXISTS "priceStemsCOP" INTEGER,
  ADD COLUMN IF NOT EXISTS "priceWavCOP" INTEGER;

-- AlterTable
ALTER TABLE "BookingSession"
  ADD COLUMN IF NOT EXISTS "isAdult" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "policyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "policyVersion" TEXT;

-- AlterTable
ALTER TABLE "Release"
  ADD COLUMN IF NOT EXISTS "amazonUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "appleUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "deezerUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "releaseDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "soundcloudUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "tidalUrl" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "YoutubeChannel" (
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
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BeatInterest" (
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
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ContactMessage" (
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
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "source" TEXT NOT NULL DEFAULT 'footer',
    "policyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "YoutubeChannel_status_featured_sortOrder_idx" ON "YoutubeChannel"("status", "featured", "sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BeatInterest_createdAt_idx" ON "BeatInterest"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContactMessage_status_createdAt_idx" ON "ContactMessage"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Subscriber_email_key" ON "Subscriber"("email");
