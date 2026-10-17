import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHANNELS_MIGRATED_KEY, applyShopSchema, migrateChannelsFromSiteConfig } from "./lib/ensure-schema.js";
import { createTempDb, psql, type TempDb } from "./test-utils/temp-db.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRISMA_DIR = join(ROOT, "prisma");
const hasDb = Boolean(process.env.DATABASE_URL);

const V3 = "20261017183453_v3_legal_channels_crm";
const APP_META = "20261017190000_app_meta";

type Cmd = { status: number; output: string };

function prismaCli(args: string[], env: Record<string, string>): Cmd {
  const r = spawnSync("npx", ["prisma", ...args], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status ?? 1, output: `${r.stdout}\n${r.stderr}` };
}

function migrateDeployScript(env: Record<string, string>): Cmd {
  const r = spawnSync("node", ["scripts/migrate-deploy.mjs"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status ?? 1, output: `${r.stdout}\n${r.stderr}` };
}

/** Copia prisma/ (schema + migraciones) a un directorio temporal, omitiendo las migraciones indicadas. */
function scratchPrismaDir(omit: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "sodimusic-prisma-"));
  cpSync(join(PRISMA_DIR, "schema.prisma"), join(dir, "schema.prisma"));
  mkdirSync(join(dir, "migrations"));
  cpSync(join(PRISMA_DIR, "migrations", "migration_lock.toml"), join(dir, "migrations", "migration_lock.toml"));
  for (const m of readdirSync(join(PRISMA_DIR, "migrations"))) {
    if (m === "migration_lock.toml" || omit.includes(m)) continue;
    cpSync(join(PRISMA_DIR, "migrations", m), join(dir, "migrations", m), { recursive: true });
  }
  return dir;
}

function dbEnv(url: string, schemaPath?: string): Record<string, string> {
  return { DATABASE_URL: url, DIRECT_URL: url, ...(schemaPath ? { PRISMA_SCHEMA_PATH: schemaPath } : {}) };
}

function tableExists(url: string, table: string): boolean {
  return psql(url, `SELECT to_regclass('public."${table}"') IS NOT NULL`).trim() === "t";
}

describe.skipIf(!hasDb)("esquema y migraciones (BD temporal vía psql)", () => {
  const dbs: TempDb[] = [];
  const clients: PrismaClient[] = [];
  const scratch: string[] = [];

  const newDb = (prefix: string): TempDb => {
    const db = createTempDb(prefix);
    dbs.push(db);
    return db;
  };
  const clientFor = (url: string): PrismaClient => {
    const c = new PrismaClient({ datasourceUrl: url });
    clients.push(c);
    return c;
  };

  beforeAll(() => {
    expect(spawnSync("psql", ["--version"], { encoding: "utf8" }).status, "psql requerido").toBe(0);
  });

  afterAll(async () => {
    await Promise.all(clients.map((c) => c.$disconnect()));
    for (const db of dbs) db.drop();
    for (const d of scratch) rmSync(d, { recursive: true, force: true });
  });

  it(
    "escenario real: BD en products_and_media + ensureShopSchema() → migrate-deploy.mjs sale 0 y el status queda limpio",
    async () => {
      const db = newDb("vitest_mig_a");
      const base = scratchPrismaDir([V3, APP_META]);
      scratch.push(base);

      // 1. BD migrada hasta products_and_media (sin v3 ni app_meta)
      const upToV2 = prismaCli(["migrate", "deploy", "--schema", join(base, "schema.prisma")], dbEnv(db.url));
      expect(upToV2.status, upToV2.output).toBe(0);
      expect(tableExists(db.url, "Product")).toBe(true);
      expect(tableExists(db.url, "YoutubeChannel")).toBe(false);

      // 2. El runtime (ensureShopSchema) crea tablas/columnas v3 antes de que el build llegue a migrate deploy
      await applyShopSchema(clientFor(db.url));
      expect(tableExists(db.url, "YoutubeChannel")).toBe(true);
      expect(tableExists(db.url, "AppMeta")).toBe(true);

      // 3. Build: migrate-deploy.mjs debe aplicar v3 + app_meta sin P3018
      const deploy = migrateDeployScript(dbEnv(db.url));
      expect(deploy.status, deploy.output).toBe(0);
      expect(deploy.output).toContain("[db:deploy] Migraciones aplicadas.");
      expect(deploy.output).not.toContain("P3018");

      // 4. Historial limpio
      const status = prismaCli(["migrate", "status"], dbEnv(db.url));
      expect(status.status, status.output).toBe(0);
      expect(status.output).toContain("Database schema is up to date!");
      const applied = psql(db.url, `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name`);
      expect(applied).toContain(V3);
      expect(applied).toContain(APP_META);

      // 5. Idempotencia real: volver a ejecutar el SQL de v3 a mano no falla
      expect(() => psql(db.url, `\\i ${join(PRISMA_DIR, "migrations", V3, "migration.sql")}`)).not.toThrow();
    },
    180_000,
  );

  it(
    "P3018 'already exists' (migración no idempotente heredada): migrate-deploy.mjs la marca como aplicada y reintenta",
    async () => {
      const db = newDb("vitest_mig_b");
      const base = scratchPrismaDir([V3, APP_META]);
      scratch.push(base);
      const upToV2 = prismaCli(["migrate", "deploy", "--schema", join(base, "schema.prisma")], dbEnv(db.url));
      expect(upToV2.status, upToV2.output).toBe(0);
      await applyShopSchema(clientFor(db.url));

      // Directorio con una v3 NO idempotente (como la original) + app_meta
      const legacy = scratchPrismaDir([V3]);
      scratch.push(legacy);
      mkdirSync(join(legacy, "migrations", V3));
      writeFileSync(
        join(legacy, "migrations", V3, "migration.sql"),
        `CREATE TABLE "YoutubeChannel" ("id" TEXT NOT NULL, CONSTRAINT "YoutubeChannel_pkey" PRIMARY KEY ("id"));\n`,
      );
      const legacySchema = join(legacy, "schema.prisma");

      const deploy = migrateDeployScript(dbEnv(db.url, legacySchema));
      expect(deploy.status, deploy.output).toBe(0);
      expect(deploy.output).toContain("P3018");
      expect(deploy.output).toContain(`[db:deploy] P3018: "${V3}" ya existe en la BD`);
      expect(deploy.output).toContain("[db:deploy] Migraciones aplicadas.");

      const status = prismaCli(["migrate", "status", "--schema", legacySchema], dbEnv(db.url));
      expect(status.status, status.output).toBe(0);
      expect(status.output).toContain("Database schema is up to date!");
    },
    180_000,
  );

  it("ensureShopSchema en una BD vacía no lanza (ALTER TABLE solo si la tabla existe)", async () => {
    const db = newDb("vitest_empty");
    const client = clientFor(db.url);
    await expect(applyShopSchema(client)).resolves.toBeUndefined();
    expect(tableExists(db.url, "Product")).toBe(true);
    expect(tableExists(db.url, "AppMeta")).toBe(true);
    expect(tableExists(db.url, "Beat")).toBe(false);
    // Segunda pasada: sigue siendo idempotente
    await expect(applyShopSchema(client)).resolves.toBeUndefined();
  });

  it(
    "migrateChannelsFromSiteConfig migra una sola vez: vacía youtube.channels del JSON y deja el flag en AppMeta",
    async () => {
      const db = newDb("vitest_channels");
      const full = prismaCli(["migrate", "deploy"], dbEnv(db.url));
      expect(full.status, full.output).toBe(0);
      const client = clientFor(db.url);
      const channels = [{ name: "Canal Test", url: "https://www.youtube.com/@canaltest", channelId: "UCtest" }];
      await client.siteConfig.create({
        data: {
          id: "default",
          publishedJson: { youtube: { channels } },
          draftJson: { youtube: { channels } },
          draftUpdatedAt: new Date(),
        },
      });

      // Primera vez: migra y marca el flag
      expect(await migrateChannelsFromSiteConfig(client)).toBe(1);
      const rows = await client.youtubeChannel.findMany();
      expect(rows.map((r) => r.name)).toEqual(["Canal Test"]);
      expect(rows[0]?.featured).toBe(true);
      const flag = await client.appMeta.findUnique({ where: { key: CHANNELS_MIGRATED_KEY } });
      expect(flag?.value).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      const cfg = await client.siteConfig.findUniqueOrThrow({ where: { id: "default" } });
      expect((cfg.publishedJson as { youtube: { channels: unknown[] } }).youtube.channels).toEqual([]);
      expect((cfg.draftJson as { youtube: { channels: unknown[] } }).youtube.channels).toEqual([]);

      // El admin borra todos los canales: NO deben resucitar aunque el JSON vuelva a traer canales
      await client.youtubeChannel.deleteMany();
      await client.siteConfig.update({ where: { id: "default" }, data: { publishedJson: { youtube: { channels } } } });
      expect(await migrateChannelsFromSiteConfig(client)).toBe(0);
      expect(await client.youtubeChannel.count()).toBe(0);
    },
    120_000,
  );

  it("migrateChannelsFromSiteConfig con canales ya existentes solo marca el flag", async () => {
    const db = newDb("vitest_channels2");
    const full = prismaCli(["migrate", "deploy"], dbEnv(db.url));
    expect(full.status, full.output).toBe(0);
    const client = clientFor(db.url);
    await client.youtubeChannel.create({ data: { name: "Existente", url: "https://www.youtube.com/@x" } });
    await client.siteConfig.create({
      data: {
        id: "default",
        publishedJson: { youtube: { channels: [{ name: "Zombi", url: "https://www.youtube.com/@z" }] } },
        draftJson: {},
        draftUpdatedAt: new Date(),
      },
    });
    expect(await migrateChannelsFromSiteConfig(client)).toBe(0);
    expect(await client.appMeta.findUnique({ where: { key: CHANNELS_MIGRATED_KEY } })).not.toBeNull();
    await client.youtubeChannel.deleteMany();
    expect(await migrateChannelsFromSiteConfig(client)).toBe(0);
    expect(await client.youtubeChannel.count()).toBe(0);
  }, 120_000);
});
