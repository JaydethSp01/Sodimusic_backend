#!/usr/bin/env node
/**
 * Aplica las migraciones de Prisma en el build (Vercel) de forma tolerante:
 *
 * - P3005 (la BD ya tiene tablas pero sin historial `_prisma_migrations`): marca como aplicadas
 *   las migraciones que ya existían en producción y reintenta.
 * - P3018 con "already exists" (ensureShopSchema() ya creó en runtime lo que la migración quería crear):
 *   marca esa migración como aplicada (`migrate resolve --applied`) y reintenta (máx. 3 veces).
 * - P3009 (una migración quedó registrada como fallida en un build anterior): la marca como
 *   revertida (`migrate resolve --rolled-back`) y reintenta; el SQL es idempotente, así que vuelve a aplicarse.
 * - BD inalcanzable desde el build (P1001, ENETUNREACH, ECONNREFUSED, timeout): avisa y sale con 0;
 *   el esquema de la tienda se garantiza en runtime con `ensureShopSchema()`.
 * - Cualquier otro error: exit 1.
 *
 * Variables opcionales: PRISMA_SCHEMA_PATH (ruta a schema.prisma, para pruebas con otro directorio de migraciones).
 * Node ESM, sin dependencias.
 */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** Migraciones que ya existían en la BD de producción antes de usar `migrate deploy`. */
export const BASELINE_MIGRATIONS = [
  "20260329024453_init",
  "20260404140000_blocked_date_scope",
  "20260404180000_page_view",
];

/** Máximo de reintentos de `migrate deploy` tras resolver una migración (P3018/P3009). */
export const MAX_RESOLVE_ITERATIONS = 3;

const UNREACHABLE_PATTERNS = [/P1001/, /ENETUNREACH/i, /ECONNREFUSED/i, /ETIMEDOUT/i, /timed?\s*out/i];

export function isUnreachable(output) {
  return UNREACHABLE_PATTERNS.some((re) => re.test(output));
}

/** Nombre de la migración que Prisma reporta en un P3018 ("Migration name: …") o P3009 ("The `…` migration … failed"). */
export function failedMigrationName(output) {
  const p3018 = /Migration name:\s*(\S+)/.exec(output);
  if (p3018) return p3018[1];
  const p3009 = /The `([^`]+)` migration started at .* failed/.exec(output);
  if (p3009) return p3009[1];
  return null;
}

/**
 * Cómo resolver la salida fallida de `migrate deploy`:
 * - { action: "applied", name }      → P3018 y el error de BD es "already exists"
 * - { action: "rolled-back", name }  → P3009 (migración marcada como fallida)
 * - null                             → no es un caso recuperable
 */
export function resolutionFor(output) {
  const name = failedMigrationName(output);
  if (!name) return null;
  if (output.includes("P3018") && /already exists/i.test(output)) return { action: "applied", name };
  if (output.includes("P3009")) return { action: "rolled-back", name };
  return null;
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function schemaArgs() {
  const p = process.env.PRISMA_SCHEMA_PATH;
  return p && p.trim().length > 0 ? ["--schema", p] : [];
}

function run(args) {
  const res = spawnSync(npx, [...args, ...schemaArgs()], {
    encoding: "utf8",
    env: process.env,
    shell: process.platform === "win32",
  });
  const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  process.stdout.write(output);
  return { status: res.status ?? 1, output, error: res.error };
}

function deploy() {
  console.log("→ prisma migrate deploy");
  return run(["prisma", "migrate", "deploy"]);
}

export function main() {
  let result = deploy();

  if (result.error) {
    console.error("[db:deploy] No se pudo ejecutar npx:", result.error.message);
    return 1;
  }

  if (result.status !== 0 && result.output.includes("P3005")) {
    console.log("[db:deploy] P3005: BD con tablas sin historial. Marcando migraciones base como aplicadas…");
    for (const name of BASELINE_MIGRATIONS) {
      const r = run(["prisma", "migrate", "resolve", "--applied", name]);
      if (r.status !== 0) {
        // Si ya estaba registrada (P3008) seguimos; si la BD no responde, lo evaluamos abajo.
        if (r.output.includes("P3008")) continue;
        if (isUnreachable(r.output)) {
          result = r;
          break;
        }
        console.error(`[db:deploy] No se pudo marcar ${name} como aplicada.`);
        return 1;
      }
    }
    if (!isUnreachable(result.output) || result.output.includes("P3005")) {
      result = deploy();
    }
  }

  // P3018 "already exists" / P3009: resolver la migración y reintentar (máx. MAX_RESOLVE_ITERATIONS).
  for (let i = 0; i < MAX_RESOLVE_ITERATIONS && result.status !== 0; i++) {
    const fix = resolutionFor(result.output);
    if (!fix) break;
    console.log(
      fix.action === "applied"
        ? `[db:deploy] P3018: "${fix.name}" ya existe en la BD (creada en runtime). Marcándola como aplicada… (${i + 1}/${MAX_RESOLVE_ITERATIONS})`
        : `[db:deploy] P3009: "${fix.name}" quedó marcada como fallida. Marcándola como revertida para reaplicarla… (${i + 1}/${MAX_RESOLVE_ITERATIONS})`,
    );
    const r = run(["prisma", "migrate", "resolve", `--${fix.action}`, fix.name]);
    if (r.status !== 0) {
      if (isUnreachable(r.output)) {
        result = r;
        break;
      }
      console.error(`[db:deploy] No se pudo resolver la migración ${fix.name} (${fix.action}).`);
      return 1;
    }
    result = deploy();
  }

  if (result.status === 0) {
    console.log("[db:deploy] Migraciones aplicadas.");
    return 0;
  }

  if (isUnreachable(result.output)) {
    console.warn(
      "[db:deploy] AVISO: la base de datos no es alcanzable desde el build (P1001/red). " +
        "Se omite `migrate deploy`; el esquema de tienda/media se asegura en runtime (ensureShopSchema).",
    );
    return 0;
  }

  console.error("[db:deploy] `prisma migrate deploy` falló.");
  return 1;
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  process.exit(main());
}
