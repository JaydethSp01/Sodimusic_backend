#!/usr/bin/env node
/**
 * Comprobación rápida de cabeceras de seguridad en HTTPS (no sustituye pentest).
 * SECURITY_CHECK_URL=https://tudominio.com node scripts/security/check-headers.mjs
 */
const url = process.env.SECURITY_CHECK_URL;
if (!url || !url.startsWith("https://")) {
  console.log("Omitido: define SECURITY_CHECK_URL con https://... para comprobar cabeceras.");
  process.exit(0);
}

const recommended = [
  ["strict-transport-security", /max-age=/i],
  ["x-content-type-options", /nosniff/i],
  ["x-frame-options", /DENY|SAMEORIGIN/i],
];

async function main() {
  const res = await fetch(url, { redirect: "manual" });
  const issues = [];
  for (const [name, pattern] of recommended) {
    const v = res.headers.get(name);
    if (!v || !pattern.test(v)) {
      issues.push(`${name}: falta o valor débil (actual: ${v ?? "—"})`);
    }
  }
  if (issues.length) {
    console.error("Cabeceras:\n", issues.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Cabeceras básicas OK en", url);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
