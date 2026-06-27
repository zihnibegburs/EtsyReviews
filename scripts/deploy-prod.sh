#!/usr/bin/env bash
# Production deploy — proje kökünden çalıştır:
#   bash scripts/deploy-prod.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "Hata: .env dosyası yok."
  echo "  cp .env.production.example .env"
  echo "  nano .env"
  exit 1
fi

# shellcheck disable=SC1091
API_DOMAIN="$(grep -E '^API_DOMAIN=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"

if [[ -z "${API_DOMAIN}" ]]; then
  echo "Hata: .env içinde API_DOMAIN tanımlı değil."
  exit 1
fi

echo "==> Deploy: ${API_DOMAIN}"
echo "==> Docker image build + containers başlatılıyor..."

docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

echo ""
echo "==> Container durumu:"
docker compose -f docker-compose.prod.yml ps

echo ""
echo "==> Health check bekleniyor..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T backend curl -fsS http://127.0.0.1:8081/health >/dev/null 2>&1; then
    echo "Backend OK"
    break
  fi
  if [[ "${i}" -eq 30 ]]; then
    echo "Uyarı: Backend henüz hazır değil. Loglar:"
    docker compose -f docker-compose.prod.yml logs --tail=50 backend
    exit 1
  fi
  sleep 3
done

echo ""
echo "Deploy tamam."
echo "  Health:  https://${API_DOMAIN}/health"
echo "  Swagger: https://${API_DOMAIN}/swagger-ui/index.html"
echo ""
echo "Static pages (Paddle verification):"
echo "  https://${API_DOMAIN}/"
echo "  https://${API_DOMAIN}/pricing"
echo "  https://${API_DOMAIN}/terms"
echo "  https://${API_DOMAIN}/privacy"
echo "  https://${API_DOMAIN}/refund"
echo "  https://${API_DOMAIN}/checkout/pay"
echo ""
echo "Paddle webhook URL:"
echo "  https://${API_DOMAIN}/api/paddle/webhook"
