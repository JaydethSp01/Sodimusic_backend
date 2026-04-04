#!/usr/bin/env bash
# Uso (desde backend/): bash scripts/prisma-baseline-existing-db.sh
# Marca la migración init como ya aplicada (tu BD ya tenía tablas) y aplica solo las pendientes.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ Marcando init como aplicada (baseline)…"
npx prisma migrate resolve --applied "20260329024453_init"

echo "→ Aplicando migraciones pendientes…"
npx prisma migrate deploy

echo "Listo."
