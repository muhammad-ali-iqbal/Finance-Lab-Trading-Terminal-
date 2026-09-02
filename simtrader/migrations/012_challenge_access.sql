-- 012_challenge_access.sql
-- Per-challenge access list.
--
-- A challenge is locked by default: a student only sees it as unlocked once
-- the admin grants access, which also auto-enrols them (see
-- Repository.GrantAccess). Revoking deletes the row here and *nothing* else —
-- the challenge_participants row, positions, orders and snapshots survive, so
-- the student is locked out without losing their portfolio and re-granting
-- restores them exactly where they left off.

CREATE TABLE IF NOT EXISTS challenge_access (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID        NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by   UUID        REFERENCES users(id),
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ca_challenge ON challenge_access (challenge_id);
CREATE INDEX IF NOT EXISTS idx_ca_user      ON challenge_access (user_id);

-- Backfill: everyone already enrolled keeps their access, otherwise this
-- migration would lock every existing participant out of a running challenge.
--
-- This must run exactly once, ever. `make migrate` re-runs every .sql file
-- with psql instead of consulting schema_migrations the way the server's
-- db.Migrate does, and a second backfill would silently re-grant access to
-- students an admin had deliberately revoked (revoke keeps the
-- challenge_participants row, so they still match this SELECT).
--
-- So it is gated on this file's own row in the migration ledger. db.Migrate
-- records that row *after* running the file, so the real first apply still
-- backfills; every later re-run is a no-op. The table is created here with
-- the same shape db.Migrate uses, in case psql runs migrations before the
-- server has ever started.
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT        PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO challenge_access (challenge_id, user_id)
SELECT cp.challenge_id, cp.user_id
FROM challenge_participants cp
WHERE NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE filename = '012_challenge_access.sql'
)
ON CONFLICT DO NOTHING;
