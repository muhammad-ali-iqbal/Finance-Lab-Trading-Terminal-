-- migrations/002_create_simulation_tables.sql
--
-- Run AFTER 001_create_users.sql
-- Command: psql $DATABASE_URL -f migrations/002_create_simulation_tables.sql
--
-- This migration creates:
--   simulations     — admin-created simulation sessions
--   price_ticks     — the CSV data, one row per symbol per minute
--   portfolios      — one per student per simulation (cash balance)
--   positions       — open stock holdings per student
--   orders          — all student orders
--   transactions    — immutable fill ledger

-- ── Simulations ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS simulations (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name             TEXT        NOT NULL,
    description      TEXT        NOT NULL DEFAULT '',
    status           TEXT        NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','active','paused','completed')),

    -- The clock tracks which simulated timestamp we're currently broadcasting.
    -- NULL means the simulation hasn't started yet.
    current_sim_time TIMESTAMPTZ,

    -- How fast simulated time moves relative to wall time.
    -- 1.0 = real time (1 minute of sim = 1 minute of wall time)
    -- 60.0 = 1 second of wall time = 1 minute of sim time (fast replay)
    speed_multiplier NUMERIC(8,2) NOT NULL DEFAULT 60.0,

    -- Starting cash given to each student when they join.
    starting_cash    NUMERIC(15,4) NOT NULL DEFAULT 100000.00,

    created_by       UUID        NOT NULL REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS simulations_status_idx ON simulations (status);

DROP TRIGGER IF EXISTS simulations_set_updated_at ON simulations;
CREATE TRIGGER simulations_set_updated_at
    BEFORE UPDATE ON simulations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Price ticks ───────────────────────────────────────────────────────────────
-- Stores the uploaded CSV data. One row per symbol per minute per simulation.
-- The clock reads from this table in order of sim_time.

CREATE TABLE IF NOT EXISTS price_ticks (
    id            BIGSERIAL   PRIMARY KEY,
    simulation_id UUID        NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    symbol        TEXT        NOT NULL,
    sim_time      TIMESTAMPTZ NOT NULL,   -- UTC timestamp from the CSV
    open          NUMERIC(15,4) NOT NULL,
    high          NUMERIC(15,4) NOT NULL,
    low           NUMERIC(15,4) NOT NULL,
    close         NUMERIC(15,4) NOT NULL,
    volume        BIGINT      NOT NULL DEFAULT 0
);

-- The hot path: clock queries "give me all ticks at exactly this sim_time"
CREATE UNIQUE INDEX IF NOT EXISTS price_ticks_sim_time_symbol_idx
    ON price_ticks (simulation_id, sim_time, symbol);

-- Range query: "give me all ticks between T1 and T2 for this simulation"
CREATE INDEX IF NOT EXISTS price_ticks_sim_time_idx
    ON price_ticks (simulation_id, sim_time);

-- Symbol filter: "give me all LUCK ticks in order"
CREATE INDEX IF NOT EXISTS price_ticks_symbol_idx
    ON price_ticks (simulation_id, symbol, sim_time);

-- ── Portfolios ────────────────────────────────────────────────────────────────
-- One portfolio per student per simulation.
-- Created automatically when a student first joins an active simulation.

CREATE TABLE IF NOT EXISTS portfolios (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID        NOT NULL REFERENCES simulations(id) ON DELETE CASCADE,
    user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cash_balance  NUMERIC(15,4) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (simulation_id, user_id)
);

CREATE INDEX IF NOT EXISTS portfolios_user_sim_idx
    ON portfolios (user_id, simulation_id);

DROP TRIGGER IF EXISTS portfolios_set_updated_at ON portfolios;
CREATE TRIGGER portfolios_set_updated_at
    BEFORE UPDATE ON portfolios
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Positions ─────────────────────────────────────────────────────────────────
-- Current open stock holdings per student.
-- quantity = 0 means the position was closed (kept for audit trail).

CREATE TABLE IF NOT EXISTS positions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id  UUID        NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
    symbol        TEXT        NOT NULL,
    quantity      BIGINT      NOT NULL DEFAULT 0,
    average_cost  NUMERIC(15,4) NOT NULL DEFAULT 0,  -- weighted average buy price
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (portfolio_id, symbol)
);

DROP TRIGGER IF EXISTS positions_set_updated_at ON positions;
CREATE TRIGGER positions_set_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Orders ────────────────────────────────────────────────────────────────────
-- All student orders. Status transitions:
--   pending → filled (market orders: immediately on next tick)
--   pending → partially_filled → filled (not implemented in v1, all-or-nothing fill)
--   pending → cancelled (student cancels)
--   pending → rejected (insufficient cash/shares, simulation paused)

CREATE TABLE IF NOT EXISTS orders (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id     UUID        NOT NULL REFERENCES simulations(id),
    portfolio_id      UUID        NOT NULL REFERENCES portfolios(id),
    user_id           UUID        NOT NULL REFERENCES users(id),
    symbol            TEXT        NOT NULL,

    side              TEXT        NOT NULL CHECK (side IN ('buy','sell')),
    type              TEXT        NOT NULL CHECK (type IN ('market','limit','stop')),

    quantity          BIGINT      NOT NULL CHECK (quantity > 0),
    limit_price       NUMERIC(15,4),   -- non-null for limit orders
    stop_price        NUMERIC(15,4),   -- non-null for stop orders

    status            TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','filled','partially_filled','cancelled','rejected')),

    filled_quantity   BIGINT      NOT NULL DEFAULT 0,
    average_fill_price NUMERIC(15,4),  -- set when filled

    -- Why the order was rejected (for UI display)
    rejection_reason  TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    filled_at         TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Clock queries pending orders for a symbol when a new tick arrives
CREATE INDEX IF NOT EXISTS orders_pending_idx
    ON orders (simulation_id, symbol, status)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS orders_portfolio_idx
    ON orders (portfolio_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_user_sim_idx
    ON orders (user_id, simulation_id, created_at DESC);

DROP TRIGGER IF EXISTS orders_set_updated_at ON orders;
CREATE TRIGGER orders_set_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Transactions ──────────────────────────────────────────────────────────────
-- Immutable ledger of every cash movement and fill.
-- Never updated, only inserted. Provides full audit trail.
-- type: 'buy_fill' | 'sell_fill' | 'starting_cash'

CREATE TABLE IF NOT EXISTS transactions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id  UUID        NOT NULL REFERENCES portfolios(id),
    order_id      UUID        REFERENCES orders(id),  -- null for starting_cash
    type          TEXT        NOT NULL,
    symbol        TEXT,
    quantity      BIGINT,
    price         NUMERIC(15,4),
    amount        NUMERIC(15,4) NOT NULL,  -- positive=credit, negative=debit
    balance_after NUMERIC(15,4) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transactions_portfolio_idx
    ON transactions (portfolio_id, created_at DESC);

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' ORDER BY table_name;
