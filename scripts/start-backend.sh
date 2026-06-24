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
./gradlew bootRun --args='--spring.profiles.active=local'
