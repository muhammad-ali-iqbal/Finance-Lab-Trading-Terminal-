#!/bin/sh
set -eu

echo "[simtrader] Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -q 2>/dev/null; do
  sleep 1
done
echo "[simtrader] PostgreSQL is ready."

# ── Database migrations (INFRA-03) ────────────────────────────────────────────
# Each file is applied in a single transaction with ON_ERROR_STOP so a partial
# failure rolls back instead of leaving a half-applied schema. A transaction
# advisory lock serialises concurrent boots, and a schema_migrations table makes
# already-applied files skippable.
echo "[simtrader] Running database migrations..."
MIGRATION_LOCK_KEY=872461

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"

for f in $(ls /app/migrations/*.sql | sort); do
  version=$(basename "$f")
  applied=$(psql "$DATABASE_URL" -tA -c \
    "SELECT 1 FROM schema_migrations WHERE filename = '$version';")
  if [ "$applied" = "1" ]; then
    echo "  • $version (already applied, skipping)"
    continue
  fi
  echo "  → $version"
  # Single transaction: take the advisory lock, apply the file, record the
  # version. ON_ERROR_STOP + --single-transaction means all-or-nothing.
  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 -q \
    -c "SELECT pg_advisory_xact_lock($MIGRATION_LOCK_KEY);" \
    -f "$f" \
    -c "INSERT INTO schema_migrations (filename) VALUES ('$version') ON CONFLICT DO NOTHING;"
done
echo "[simtrader] Migrations complete."

# ── Admin credentials (INFRA-02 / DATA-01) ────────────────────────────────────
# The seed admin ships BLOCKED with an unusable password. We must configure a
# real one here. In production this is mandatory — the container refuses to boot
# with no admin configured. In non-production, we generate a random password and
# print it once so local dev still has a usable admin without shipping a default.
configure_admin() {
  email="$1"
  password="$2"
  hash=$(ADMIN_PW="$password" python3 -c "
import bcrypt, os
print(bcrypt.hashpw(os.environ['ADMIN_PW'].encode(), bcrypt.gensalt(12)).decode())
")
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
    -c "UPDATE users SET email = '$email', password_hash = '$hash', status = 'active' WHERE role = 'admin'"
}

if [ -n "${ADMIN_EMAIL:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
  echo "[simtrader] Configuring admin credentials for: $ADMIN_EMAIL"
  configure_admin "$ADMIN_EMAIL" "$ADMIN_PASSWORD"
  echo "[simtrader] ✓ Admin account configured."
elif [ "${ENV:-production}" = "production" ]; then
  echo "[simtrader] ✗ FATAL: ENV=production but ADMIN_EMAIL / ADMIN_PASSWORD are not set." >&2
  echo "[simtrader]   Refusing to boot with no admin account. Set both env vars." >&2
  exit 1
else
  # Non-production convenience: generate a strong random password, print once.
  GEN_EMAIL="${ADMIN_EMAIL:-admin@simtrader.local}"
  GEN_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(18))")
  echo "[simtrader] ⚠  No admin configured (ENV=${ENV:-dev}). Generating a random dev admin."
  configure_admin "$GEN_EMAIL" "$GEN_PASSWORD"
  echo "[simtrader] ──────────────────────────────────────────────────────────"
  echo "[simtrader]   DEV ADMIN  email:    $GEN_EMAIL"
  echo "[simtrader]   DEV ADMIN  password: $GEN_PASSWORD"
  echo "[simtrader]   (shown once — set ADMIN_EMAIL/ADMIN_PASSWORD to control it)"
  echo "[simtrader] ──────────────────────────────────────────────────────────"
fi

echo "[simtrader] Starting server..."
exec /app/server
