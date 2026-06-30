-- migrations/001_create_users.sql
--
-- Run this file once against your PostgreSQL database to set up the schema.
-- On Railway: connect via the provided DATABASE_URL and run with psql.
--
-- Command: psql $DATABASE_URL -f migrations/001_create_users.sql
--
-- Each migration is intentionally a single file — no migration framework
-- dependency. For a team new to Go, fewer moving parts is better.
-- If you later need rollbacks, add a 001_drop_users.sql alongside it.

-- ── Extensions ────────────────────────────────────────────────────────────────

-- pgcrypto gives us gen_random_uuid() for UUID primary keys.
-- uuid-ossp is the older alternative — pgcrypto is preferred in PG 13+.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Users ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT        NOT NULL,
    password_hash TEXT        NOT NULL DEFAULT '', -- empty until registration complete
    first_name    TEXT        NOT NULL DEFAULT '',
    last_name     TEXT        NOT NULL DEFAULT '',

    -- role: 'admin' | 'student'
    -- Using TEXT + CHECK instead of an ENUM so we can add roles later
    -- without an ALTER TYPE (which locks the table in older PG versions).
    role          TEXT        NOT NULL DEFAULT 'student'
                              CHECK (role IN ('admin', 'student')),

    -- status lifecycle:
    --   pending  → invited but not yet registered
    --   active   → fully registered, can log in
    --   blocked  → admin suspended the account
    status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'active', 'blocked')),

    -- invite_token is set when admin invites a student.
    -- Cleared to NULL once registration is complete.
    -- Indexed because we look it up on the registration page.
    invite_token  TEXT        UNIQUE,

    -- reset_token + reset_expiry for the forgot-password flow.
    -- reset_expiry is checked in the query — expired tokens are rejected at DB level.
    reset_token   TEXT        UNIQUE,
    reset_expiry  TIMESTAMPTZ,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email uniqueness enforced case-insensitively.
-- Using a unique index on lower(email) rather than a UNIQUE constraint
-- on the column means "admin@example.com" and "Admin@Example.com" are treated
-- as the same address.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx
    ON users (LOWER(email));

-- Partial index on invite_token — only indexes non-null values.
-- This keeps the index small since most users have NULL invite_token
-- after completing registration.
CREATE INDEX IF NOT EXISTS users_invite_token_idx
    ON users (invite_token)
    WHERE invite_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_reset_token_idx
    ON users (reset_token)
    WHERE reset_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_role_status_idx
    ON users (role, status);

-- ── Refresh tokens ────────────────────────────────────────────────────────────
--
-- We store refresh tokens separately from users for two reasons:
-- 1. A user can have multiple active sessions (phone + laptop + tablet)
-- 2. We can revoke individual sessions or all sessions for a user
--
-- We store the SHA-256 hash of the token, never the raw token.
-- If this table is dumped by an attacker, the tokens are useless.

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN     NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The hot path: validate a token on every API call that needs a refresh.
CREATE INDEX IF NOT EXISTS refresh_tokens_hash_idx
    ON refresh_tokens (token_hash)
    WHERE revoked = false;

-- Used when we revoke all sessions for a user (block, password change).
CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx
    ON refresh_tokens (user_id);

-- Cleanup index — expired + revoked tokens can be deleted by a maintenance job.
CREATE INDEX IF NOT EXISTS refresh_tokens_cleanup_idx
    ON refresh_tokens (expires_at)
    WHERE revoked = true;

-- ── Updated_at trigger ────────────────────────────────────────────────────────
--
-- Automatically keeps updated_at current on any UPDATE.
-- Without this, you must remember to set updated_at in every UPDATE query —
-- which developers forget. The trigger never forgets.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ── Seed: first admin account ─────────────────────────────────────────────────
--
-- This creates the initial admin PLACEHOLDER account, seeded as 'blocked' so
-- the well-known placeholder password can never be used to log in (INFRA-02 /
-- DATA-01). entrypoint.sh sets the real password from ADMIN_EMAIL/ADMIN_PASSWORD
-- and flips the account to 'active' — and refuses to boot in production if those
-- env vars are unset. The hash below is a deliberately unusable placeholder.
--
-- To generate a hash manually:
--   docker run --rm python:3.11-slim python3 -c \
--     "import bcrypt; print(bcrypt.hashpw(b'yourpassword', bcrypt.gensalt(12)).decode())"

INSERT INTO users (id, email, password_hash, first_name, last_name, role, status)
VALUES (
    gen_random_uuid(),
    'admin@simtrader.app',
    'x',                      -- invalid bcrypt hash: never matches any password
    'System',
    'Admin',
    'admin',
    'blocked'                 -- inert until entrypoint.sh configures real creds
)
ON CONFLICT DO NOTHING;

-- ── Verification query ────────────────────────────────────────────────────────
-- Run this after migration to confirm everything looks right:
-- SELECT id, email, role, status, created_at FROM users;
