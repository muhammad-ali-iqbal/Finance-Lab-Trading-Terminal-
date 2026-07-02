-- migrations/008_announcements.sql
--
-- Logs admin-broadcast email announcements sent to all active students,
-- using the existing IBA-branded HTML template. One row per "send" action.

CREATE TABLE IF NOT EXISTS announcements (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject          TEXT        NOT NULL,
    heading          TEXT        NOT NULL,
    body             TEXT        NOT NULL,
    created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,

    -- status lifecycle: pending -> sending -> completed | failed
    -- 'failed' means the batch could not start (e.g. no recipients);
    -- partial per-recipient failures still land in 'completed' with failed_count > 0.
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'sending', 'completed', 'failed')),

    recipient_count  INTEGER     NOT NULL DEFAULT 0,
    sent_count       INTEGER     NOT NULL DEFAULT 0,
    failed_count     INTEGER     NOT NULL DEFAULT 0,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS announcements_created_at_idx
    ON announcements (created_at DESC);
