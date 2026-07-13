-- migrations/009_symbol_display_preference.sql
--
-- Per-user display preference: show stock symbols as raw tickers (e.g. MEBL)
-- or full company names (e.g. Meezan Bank Limited). Synced to the account so
-- it's consistent across devices.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS symbol_display TEXT NOT NULL DEFAULT 'ticker'
        CHECK (symbol_display IN ('ticker', 'name'));
