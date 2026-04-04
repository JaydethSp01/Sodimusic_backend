#!/usr/bin/env node
/**
 * Monitorización sintética mínima: comprueba endpoints vivos (para cron o CI).
 * SYNTHETIC_BACKEND_URL, SYNTHETIC_FRONTEND_URL (opcional)
 */
const backend = process.env.SYNTHETIC_BACKEND_URL ?? "http://127.0.0.1:4000";
const frontend = process.env.SYNTHETIC_FRONTEND_URL;

async function check(name, url, { json } = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      console.error(`[FAIL] ${name} ${res.status} (${ms}ms) ${url}`);
      return false;
    }
    if (json) {
      const j = await res.json();
      if (typeof j !== "object" || j === null) {
        console.error(`[FAIL] ${name} JSON inválido`);
        return false;
      }
    }
    console.log(`[OK] ${name} (${ms}ms)`);
    return true;
  } catch (e) {
    console.error(`[FAIL] ${name}`, e.message);
    return false;
  }
}

async function main() {
  let ok = true;
  ok = (await check("backend /health", `${backend.replace(/\/$/, "")}/health`, { json: true })) && ok;
  ok =
    (await check("backend /api/site-config", `${backend.replace(/\/$/, "")}/api/site-config`, { json: true })) && ok;
  if (frontend) {
    ok = (await check("frontend /", `${frontend.replace(/\/$/, "")}/`)) && ok;
  }
  if (!ok) process.exit(1);
}

main();
