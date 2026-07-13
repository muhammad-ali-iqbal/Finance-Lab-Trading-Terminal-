-- 011_challenge_dividends.sql
-- Ledger of corporate-action payouts applied to challenge participants.
--
-- The nightly reconciler checks PSX dividend/bonus announcements for every
-- symbol held in an active challenge; once the book-closure date arrives it
-- credits cash (cash dividends, % of PKR 10 face value) or shares (bonus
-- issues) to entitled participants. Each application is recorded here, and
-- the UNIQUE constraint is the idempotency guard: one payout per participant
-- per symbol per book-closure per kind, no matter how many times the
-- reconciler re-runs.

CREATE TABLE IF NOT EXISTS challenge_dividends (
    id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id        UUID          NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_id      UUID          NOT NULL REFERENCES challenge_participants(id),
    symbol              TEXT          NOT NULL,
    kind                TEXT          NOT NULL CHECK (kind IN ('dividend','bonus')),
    announcement        TEXT          NOT NULL,            -- raw PSX text, e.g. "60%(i) (D)"
    percent             NUMERIC(10,4) NOT NULL,            -- payout % as announced
    book_closure_start  DATE          NOT NULL,
    quantity_held       INT           NOT NULL,            -- entitled shares at application time
    cash_credited       NUMERIC(15,2) NOT NULL DEFAULT 0,  -- for kind='dividend'
    shares_credited     INT           NOT NULL DEFAULT 0,  -- for kind='bonus'
    applied_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (participant_id, symbol, book_closure_start, kind)
);

CREATE INDEX IF NOT EXISTS idx_cd_participant ON challenge_dividends (participant_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_cd_challenge   ON challenge_dividends (challenge_id);
