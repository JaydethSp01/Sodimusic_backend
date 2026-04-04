-- Bloqueos: día completo (DAY) o franja (morning | afternoon | night). dateKey = yyyy-MM-dd (UTC).

ALTER TABLE "BlockedDate" ADD COLUMN "dateKey" TEXT;
ALTER TABLE "BlockedDate" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'DAY';

UPDATE "BlockedDate" SET "dateKey" = to_char(("date" AT TIME ZONE 'UTC'), 'YYYY-MM-DD');

ALTER TABLE "BlockedDate" ALTER COLUMN "dateKey" SET NOT NULL;

ALTER TABLE "BlockedDate" DROP COLUMN "date";

CREATE UNIQUE INDEX "BlockedDate_dateKey_scope_key" ON "BlockedDate"("dateKey", "scope");
CREATE INDEX "BlockedDate_dateKey_idx" ON "BlockedDate"("dateKey");
