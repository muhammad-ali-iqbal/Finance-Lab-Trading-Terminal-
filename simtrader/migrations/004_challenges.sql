-- 004_challenges.sql
-- Schema for the semester-long Challenge feature.
-- Challenges use live PSX EOD data (fed by psx_tracker) rather than
-- historical replay. Orders fill nightly after market close.

-- EOD price feed — written to by psx_tracker via /api/internal/eod-prices
CREATE TABLE IF NOT EXISTS eod_prices (
    symbol      TEXT        NOT NULL,
    trade_date  DATE        NOT NULL,
    open        NUMERIC(12,4) NOT NULL,
    high        NUMERIC(12,4) NOT NULL,
    low         NUMERIC(12,4) NOT NULL,
    close       NUMERIC(12,4) NOT NULL,
    volume      BIGINT      NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (symbol, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_eod_prices_date ON eod_prices (trade_date DESC);

-- ── Challenges ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenges (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT         NOT NULL,
    description      TEXT         NOT NULL DEFAULT '',
    start_date       DATE         NOT NULL,
    end_date         DATE         NOT NULL,
    initial_capital  NUMERIC(15,2) NOT NULL DEFAULT 100000.00,
    status           TEXT         NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','active','completed')),
    created_by       UUID         NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CHECK (end_date > start_date)
);

DROP TRIGGER IF EXISTS challenges_set_updated_at ON challenges;
CREATE TRIGGER challenges_set_updated_at
    BEFORE UPDATE ON challenges
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Participants (one row per student per challenge) ─────────────────────────

CREATE TABLE IF NOT EXISTS challenge_participants (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    UUID         NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id         UUID         NOT NULL REFERENCES users(id),
    cash_balance    NUMERIC(15,2) NOT NULL,
    joined_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cp_challenge ON challenge_participants (challenge_id);
CREATE INDEX IF NOT EXISTS idx_cp_user      ON challenge_participants (user_id);

-- ── Orders placed by participants ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_orders (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    UUID         NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_id  UUID         NOT NULL REFERENCES challenge_participants(id),
    symbol          TEXT         NOT NULL,
    side            TEXT         NOT NULL CHECK (side IN ('buy','sell')),
    order_type      TEXT         NOT NULL DEFAULT 'market'
                    CHECK (order_type IN ('market','limit')),
    quantity        INT          NOT NULL CHECK (quantity > 0),
    limit_price     NUMERIC(12,4),
    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','filled','cancelled','rejected')),
    fill_price      NUMERIC(12,4),
    fill_date       DATE,
    reject_reason   TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS challenge_orders_set_updated_at ON challenge_orders;
CREATE TRIGGER challenge_orders_set_updated_at
    BEFORE UPDATE ON challenge_orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_co_participant ON challenge_orders (participant_id);
CREATE INDEX IF NOT EXISTS idx_co_challenge   ON challenge_orders (challenge_id);
CREATE INDEX IF NOT EXISTS idx_co_pending     ON challenge_orders (challenge_id, status)
    WHERE status = 'pending';

-- ── Positions (aggregate holdings) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS challenge_positions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    UUID         NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_id  UUID         NOT NULL REFERENCES challenge_participants(id),
    symbol          TEXT         NOT NULL,
    quantity        INT          NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    avg_cost        NUMERIC(12,4) NOT NULL DEFAULT 0,
    UNIQUE (participant_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_cpos_participant ON challenge_positions (participant_id);

-- ── Daily portfolio snapshots (for performance chart) ────────────────────────

CREATE TABLE IF NOT EXISTS challenge_snapshots (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    UUID         NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    participant_id  UUID         NOT NULL REFERENCES challenge_participants(id),
    snapshot_date   DATE         NOT NULL,
    portfolio_value NUMERIC(15,2) NOT NULL,
    cash_balance    NUMERIC(15,2) NOT NULL,
    UNIQUE (participant_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_cs_participant ON challenge_snapshots (participant_id, snapshot_date);
