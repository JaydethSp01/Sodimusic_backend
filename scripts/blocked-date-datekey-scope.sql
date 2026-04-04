-- Ejecutar en Supabase SQL Editor si prisma migrate deploy no puede (P3005 / baseline).
-- Idempotente: puedes lanzarlo dos veces sin romper (si ya está aplicado, los IF lo evitan).
-- Si tus tablas están en otro esquema (p. ej. sodimusic), descomenta y ajusta:
-- SET search_path TO sodimusic, public;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'BlockedDate'
      AND column_name = 'date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'BlockedDate'
      AND column_name = 'dateKey'
  ) THEN
    ALTER TABLE "BlockedDate" ADD COLUMN "dateKey" TEXT;
    ALTER TABLE "BlockedDate" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'DAY';
    UPDATE "BlockedDate" SET "dateKey" = to_char(("date" AT TIME ZONE 'UTC'), 'YYYY-MM-DD');
    ALTER TABLE "BlockedDate" ALTER COLUMN "dateKey" SET NOT NULL;
    ALTER TABLE "BlockedDate" DROP COLUMN "date";
    CREATE UNIQUE INDEX IF NOT EXISTS "BlockedDate_dateKey_scope_key" ON "BlockedDate"("dateKey", "scope");
    CREATE INDEX IF NOT EXISTS "BlockedDate_dateKey_idx" ON "BlockedDate"("dateKey");
  END IF;
END $$;
