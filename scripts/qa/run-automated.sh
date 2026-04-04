#!/usr/bin/env bash
# Suite QA: build, tests, auditoría; carga/sintético si el API responde.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "== build =="
npm run build

echo "== tests =="
npm run test

echo "== npm audit =="
npm audit --audit-level=high || true

LOAD_URL="${LOAD_TEST_URL:-http://127.0.0.1:4000}"
if curl -sf "${LOAD_URL%/}/health" >/dev/null 2>&1; then
  echo "== carga (${LOAD_URL}) =="
  LOAD_TEST_URL="$LOAD_URL" node scripts/load/smoke.mjs
  echo "== sintético =="
  SYNTHETIC_BACKEND_URL="$LOAD_URL" SYNTHETIC_FRONTEND_URL="${SYNTHETIC_FRONTEND_URL:-}" node scripts/monitor/synthetic.mjs
else
  echo "== carga + sintético omitidos (no responde ${LOAD_URL}/health) =="
fi

SECURITY_CHECK_URL="${SECURITY_CHECK_URL:-}" node scripts/security/check-headers.mjs

echo "E2E del frontend: repo Sodimusic_frontend → npm run test:e2e"
