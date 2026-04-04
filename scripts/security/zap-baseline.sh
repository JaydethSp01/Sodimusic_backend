#!/usr/bin/env bash
# Escaneo baseline OWASP ZAP (requiere Docker). No sustituye pentest manual.
# Uso: ./scripts/security/zap-baseline.sh https://staging.tudominio.com
set -euo pipefail
TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  echo "Uso: $0 <URL_base_https>"
  exit 1
fi
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t "$TARGET" -I
