#!/bin/sh
set -e

# Only run migrations if DATABASE_URL is set (prod/compose)
if [ -n "$DATABASE_URL" ]; then
  echo "Running Prisma migrate deploy..."
  npx prisma migrate deploy
fi

echo "Starting Next.js standalone server..."
exec node server.js
