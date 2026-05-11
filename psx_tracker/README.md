# PSX Tracker

Collects end-of-day OHLCV data for every stock traded on the Pakistan Stock Exchange and stores it locally in SQLite. Acts as the live data pipeline for the SimTrader Challenge feature — pushing daily prices to the SimTrader backend after each fetch.

## What it does

- Pulls the full list of ~1,035 PSX-listed symbols on first run
- Fetches daily Open / High / Low / Close / Volume for every symbol after market close (16:00 PKT)
- Automatically backfills any days missed while the process was offline
- Pushes each day's prices to the SimTrader backend via `/api/internal/eod-prices` — this triggers nightly order reconciliation for active challenges

## Requirements

- Python 3.10+
- Internet access to `dps.psx.com.pk`
- SimTrader backend running (for the push integration)

## Setup

```bash
cd psx_tracker
pip install -r requirements.txt
```

Configure the SimTrader integration in `config.py` or via environment variables (defaults work for local dev):

```env
SIMTRADER_URL=http://localhost:8080
INTERNAL_SECRET=dev-internal-secret
```

## Daily Startup

Run this once when you start work — it runs forever and handles everything automatically:

```cmd
python main.py
```

Fetches EOD data every weekday at 16:00 PKT, pushes prices to SimTrader, and backfills any days missed while offline.

## Usage

### Start the live scheduler
Runs continuously. Fetches EOD data every weekday at 16:00 PKT, refreshes tickers every Sunday, and automatically pushes each day's prices to SimTrader.

```bash
python main.py
```

### One-off commands

```bash
# Fetch today's data and exit (also pushes to SimTrader)
python main.py fetch

# Backfill a date range (also pushes each date to SimTrader)
python main.py backfill 2026-04-29
python main.py backfill 2026-04-29 2026-05-11

# Refresh the ticker list only
python main.py tickers

# Show database stats
python main.py status
```

### Seed SimTrader from existing SQLite data

If the SimTrader PostgreSQL database is empty (e.g. first setup or new server), push all historical data in one shot:

```bash
# Push everything
python sync_to_simtrader.py

# Push from a specific date onwards (skips already-synced dates)
python sync_to_simtrader.py 2026-04-29
```

Run this once after initial backfill. After that, daily automation keeps SimTrader current automatically.

## Configuration

Edit `config.py` to change defaults:

| Setting | Default | Description |
|---|---|---|
| `DB_PATH` | `psx_data.db` (next to `config.py`) | SQLite database location |
| `START_DATE` | `2026-04-29` | Earliest date to backfill |
| `EOD_FETCH_TIME` | `"16:00"` | Daily fetch time (PKT, 24h) |
| `BATCH_SIZE` | `50` | Symbols fetched per HTTP batch |
| `BATCH_DELAY` | `2` | Seconds between batches |
| `SIMTRADER_URL` | `http://localhost:8080` | SimTrader backend URL |
| `INTERNAL_SECRET` | `dev-internal-secret` | Shared secret for backend push |

## Database

A single SQLite file (`psx_data.db`) with three tables:

- **`tickers`** — all known PSX symbols with active/inactive status
- **`daily_ohlcv`** — one row per symbol per trading day (Open, High, Low, Close, Volume)
- **`fetch_log`** — audit trail of every fetch run (date, status, rows saved, errors)

## SimTrader integration

After each successful `fetch_day()` run, `fetcher.py` calls `_push_to_simtrader()`, which POSTs the day's OHLCV rows to:

```
POST /api/internal/eod-prices
X-Internal-Secret: <INTERNAL_SECRET>

{ "date": "YYYY-MM-DD", "prices": [ { "symbol": "...", "open": ..., ... } ] }
```

The backend stores these in the `eod_prices` PostgreSQL table and immediately triggers the challenge reconciler for that date (filling pending student orders). Failures are logged but do not abort the local SQLite write.

## Why EOD and not minute-by-minute?

Daily closing prices are the industry standard for portfolio valuation and P&L calculation. Intraday data would make the database ~500x larger with no improvement to holding-period return accuracy.

## Data source

Scraped from the PSX public endpoint at `dps.psx.com.pk`. No API key required. The `psx-data-reader` PyPI package is used only for ticker discovery; historical OHLCV is fetched directly due to a breaking change in the PSX HTML response format that the package (last updated 2022) does not handle.
