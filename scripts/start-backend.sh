#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting Etsy Reviews API (Spring Boot)..."
echo ""
echo "  DB:         localhost:5433/etsy_extension"
echo "  API:        http://localhost:8081"
echo ""

LOCAL_PROPS="$ROOT_DIR/backend/src/main/resources/application-local.properties"
if [ ! -f "$LOCAL_PROPS" ]; then
  echo "ERROR: application-local.properties bulunamadi."
  echo "       cp backend/src/main/resources/application-local.properties.example \\"
  echo "          backend/src/main/resources/application-local.properties"
  exit 1
fi

cd "$ROOT_DIR/backend"

# Boş env değişkenleri application-local.properties'i ezer (Spring Boot önceliği).
# Cursor/IDE .env yüklediyse PADDLE_HOSTED_CHECKOUT_URL= gibi satırlar checkout'u kırar.
for var in PADDLE_HOSTED_CHECKOUT_URL; do
  if [ -z "${!var:-}" ]; then
    unset "$var" 2>/dev/null || true
  fi
done

./gradlew bootRun --args='--spring.profiles.active=local'
