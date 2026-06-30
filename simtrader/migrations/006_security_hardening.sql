-- migrations/006_security_hardening.sql
--
-- Closes audit findings AUTH-02 (invite-token expiry) and INFRA-02/DATA-01
-- (publicly-known default admin password). Idempotent — safe to re-run.

-- ── AUTH-02: invite-token expiry ──────────────────────────────────────────────
-- Invite tokens previously never expired. Add an expiry column; the service
-- sets it to NOW()+7d at invite time and GetByInviteToken enforces it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expiry TIMESTAMPTZ;

-- ── INFRA-02 / DATA-01: neutralise the seeded default admin ───────────────────
-- Migration 001 historically seeded admin@simtrader.app with the publicly
-- documented password 'ChangeMe123!' as an ACTIVE account. On any database
-- where that exact hash is still present, block the account so the known
-- credential cannot be used to log in. entrypoint.sh re-activates the admin
-- with operator-supplied ADMIN_EMAIL/ADMIN_PASSWORD (and refuses to boot in
-- production if those are unset).
UPDATE users
SET status = 'blocked'
WHERE email = 'admin@simtrader.app'
  AND password_hash = '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4oE9/gH1Ky';
