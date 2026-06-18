#!/usr/bin/env bash
set -euo pipefail

URL="${RENDER_HEALTH_URL:-https://etsy-backend-u3x2.onrender.com/health}"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Pinging $URL"

if curl -fsS --max-time 90 "$URL"; then
  echo ""
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] OK"
else
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] FAILED" >&2
  exit 1
fi
