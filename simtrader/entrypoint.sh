#!/bin/sh
set -e

echo "[simtrader] Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -q 2>/dev/null; do
  sleep 1
done
echo "[simtrader] PostgreSQL is ready."

echo "[simtrader] Running database migrations..."
for f in $(ls /app/migrations/*.sql | sort); do
  echo "  → $(basename "$f")"
  psql "$DATABASE_URL" -f "$f" -q
done
echo "[simtrader] Migrations complete."

echo "[simtrader] Starting server..."
exec /app/server
