# PSX Tracker

Collects end-of-day OHLCV data for every stock traded on the Pakistan Stock Exchange and stores it locally in a SQLite database. Built as the data foundation for a portfolio earnings tracker.

## What it does

- Pulls the full list of ~1,035 PSX-listed symbols on first run
- Fetches daily Open / High / Low / Close / Volume for every symbol after market close (16:00 PKT)
- Automatically backfills any days missed while the process was offline
- Refreshes the ticker list weekly to pick up new listings

## Requirements

- Python 3.10+
- Internet access to `dps.psx.com.pk`

## Setup

```bash
cd psx_tracker
pip install -r requirements.txt
```

## Usage

### Start the live scheduler
Runs continuously. Fetches EOD data every weekday at 16:00 PKT, refreshes tickers every Sunday.

```bash
python main.py
```

### One-off commands

```bash
# Fetch today's data and exit
python main.py fetch

# Backfill a date range (e.g. if the process was offline)
python main.py backfill 2026-04-01
python main.py backfill 2026-04-01 2026-04-28

# Refresh the ticker list only
python main.py tickers

# Show database stats
python main.py status
```

## Configuration

Edit `config.py` to change defaults:

| Setting | Default | Description |
|---|---|---|
| `DB_PATH` | `psx_data.db` (next to `config.py`) | SQLite database location |
| `START_DATE` | `2026-04-29` | Earliest date to backfill |
| `EOD_FETCH_TIME` | `"16:00"` | Daily fetch time (PKT, 24h) |
| `BATCH_SIZE` | `50` | Symbols fetched per HTTP batch |
| `BATCH_DELAY` | `2` | Seconds between batches |

## Database

A single SQLite file (`psx_data.db`) with three tables:

- **`tickers`** — all known PSX symbols
- **`daily_ohlcv`** — one row per symbol per trading day (Open, High, Low, Close, Volume)
- **`fetch_log`** — audit trail of every fetch run (date, status, rows saved, errors)

## Why EOD and not minute-by-minute?

Daily closing prices are the industry standard for portfolio valuation and P&L calculation. Intraday (minute) data would make the database ~500x larger with no improvement to holding-period return accuracy. Minute-level data is only needed for intraday strategies or VWAP-based cost analysis — neither of which is in scope here.

## Data source

Data is scraped from the PSX public endpoint at `dps.psx.com.pk`. No API key required. The `psx-data-reader` PyPI package is used only for ticker discovery; historical data is fetched directly due to a breaking change in the PSX HTML response format that the package (last updated 2022) does not handle.

## Next steps

- Portfolio layer: record holdings, buy/sell transactions, compute daily NAV and returns
- Reporting: P&L charts, sector breakdown, benchmark comparison vs. KSE-100
