-- CreateTable (idempotente: ensureShopSchema() puede haberla creado antes en runtime)
CREATE TABLE IF NOT EXISTS "AppMeta" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppMeta_pkey" PRIMARY KEY ("key")
);
