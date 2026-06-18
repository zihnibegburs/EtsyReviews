#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "Starting Etsy Reviews API (Spring Boot)..."
echo ""
echo "  DB:         localhost:5433/etsy_extension"
echo "  API:        http://localhost:8081"
echo ""

cd "$ROOT_DIR/backend"
./gradlew bootRun --args='--spring.profiles.active=local'
