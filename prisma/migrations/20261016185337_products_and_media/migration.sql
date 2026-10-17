-- Idempotente: ensureShopSchema() (runtime) puede haber creado estas tablas antes del build.

-- AlterTable
ALTER TABLE "SiteConfig" ALTER COLUMN "id" SET DEFAULT 'default';

-- CreateTable
CREATE TABLE IF NOT EXISTS "Product" (
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
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "MediaAsset" (
    "id" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_status_idx" ON "Product"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_featured_idx" ON "Product"("featured");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Product_sortOrder_idx" ON "Product"("sortOrder");
