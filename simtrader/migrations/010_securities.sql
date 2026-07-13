-- migrations/010_securities.sql
--
-- Ticker -> full company name lookup, scraped from PSX's own symbols
-- directory (dps.psx.com.pk/symbols) by psx_tracker and pushed here the
-- same way EOD prices are. Powers the "company name" display preference.

CREATE TABLE IF NOT EXISTS securities (
    symbol      TEXT        PRIMARY KEY,
    name        TEXT        NOT NULL,
    sector      TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
