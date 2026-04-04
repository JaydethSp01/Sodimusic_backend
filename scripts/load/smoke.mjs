#!/usr/bin/env node
/**
 * Prueba de carga ligera (sin k6): muchas peticiones concurrentes a /health y un endpoint público.
 * Uso: LOAD_TEST_URL=http://localhost:4000 node scripts/load/smoke.mjs
 */
const base = (process.env.LOAD_TEST_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const concurrent = Number(process.env.LOAD_CONCURRENT ?? 25);
const rounds = Number(process.env.LOAD_ROUNDS ?? 40);

async function one(url) {
  const t0 = performance.now();
  const res = await fetch(url, { cache: "no-store" });
  const ms = performance.now() - t0;
  return { ok: res.ok, status: res.status, ms };
}

async function burst(path) {
  const url = `${base}${path}`;
  const tasks = Array.from({ length: concurrent }, () => one(url));
  return Promise.all(tasks);
}

async function main() {
  console.log(`Carga: ${base} · ${concurrent} concurrentes × ${rounds} rondas`);
  const paths = ["/health", "/api/site-config"];
  const latencies = [];

  for (let r = 0; r < rounds; r++) {
    for (const p of paths) {
      const results = await burst(p);
      for (const x of results) {
        latencies.push(x.ms);
        if (!x.ok) {
          console.error(`Fallo ${p}: status ${x.status}`);
          process.exitCode = 1;
        }
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const max = latencies[latencies.length - 1];
  console.log(`Peticiones: ${latencies.length} · p50 ${p50.toFixed(1)}ms · p95 ${p95.toFixed(1)}ms · max ${max.toFixed(1)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
