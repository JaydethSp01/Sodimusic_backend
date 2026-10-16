import { prisma } from "./prisma.js";

/**
 * SQL idempotente equivalente a la migración `products_and_media`.
 * El build de Vercel puede no alcanzar la BD (IPv6/pooler), así que las tablas de la tienda
 * y de media se garantizan también en runtime antes de usarlas.
 */
const SHOP_SCHEMA_SQL: readonly string[] = [
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
];

let shopSchemaReady: Promise<void> | null = null;

/**
 * Garantiza (una vez por instancia) que existen las tablas `Product` y `MediaAsset`.
 * Si falla, se descarta la promesa memoizada para reintentar en la siguiente petición
 * y el error se propaga al `onError` de Hono.
 */
export function ensureShopSchema(): Promise<void> {
  if (!shopSchemaReady) {
    shopSchemaReady = (async () => {
      for (const sql of SHOP_SCHEMA_SQL) {
        await prisma.$executeRawUnsafe(sql);
      }
    })().catch((err: unknown) => {
      shopSchemaReady = null;
      throw err;
    });
  }
  return shopSchemaReady;
}
