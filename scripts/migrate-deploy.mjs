#!/usr/bin/env node
/**
 * Aplica las migraciones de Prisma en el build (Vercel) de forma tolerante:
 *
 * - P3005 (la BD ya tiene tablas pero sin historial `_prisma_migrations`): marca como aplicadas
 *   las migraciones que ya existían en producción y reintenta.
 * - BD inalcanzable desde el build (P1001, ENETUNREACH, ECONNREFUSED, timeout): avisa y sale con 0;
 *   el esquema de la tienda se garantiza en runtime con `ensureShopSchema()`.
 * - Cualquier otro error: exit 1.
 *
 * Node ESM, sin dependencias.
 */
import { spawnSync } from "node:child_process";

/** Migraciones que ya existían en la BD de producción antes de usar `migrate deploy`. */
const BASELINE_MIGRATIONS = [
  "20260329024453_init",
  "20260404140000_blocked_date_scope",
  "20260404180000_page_view",
];

const UNREACHABLE_PATTERNS = [/P1001/, /ENETUNREACH/i, /ECONNREFUSED/i, /ETIMEDOUT/i, /timed?\s*out/i];

const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function run(args) {
  const res = spawnSync(npx, args, { encoding: "utf8", env: process.env, shell: process.platform === "win32" });
  const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`;
  process.stdout.write(output);
  return { status: res.status ?? 1, output, error: res.error };
}

function isUnreachable(output) {
  return UNREACHABLE_PATTERNS.some((re) => re.test(output));
}

function deploy() {
  console.log("→ prisma migrate deploy");
  return run(["prisma", "migrate", "deploy"]);
}

let result = deploy();

if (result.error) {
  console.error("[db:deploy] No se pudo ejecutar npx:", result.error.message);
  process.exit(1);
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
      process.exit(1);
    }
  }
  if (!isUnreachable(result.output) || result.output.includes("P3005")) {
    result = deploy();
  }
}

if (result.status === 0) {
  console.log("[db:deploy] Migraciones aplicadas.");
  process.exit(0);
}

if (isUnreachable(result.output)) {
  console.warn(
    "[db:deploy] AVISO: la base de datos no es alcanzable desde el build (P1001/red). " +
      "Se omite `migrate deploy`; el esquema de tienda/media se asegura en runtime (ensureShopSchema).",
  );
  process.exit(0);
}

console.error("[db:deploy] `prisma migrate deploy` falló.");
process.exit(1);
