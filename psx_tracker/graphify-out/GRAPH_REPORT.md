# Graph Report - C:\Users\maiqbal\psx_tracker  (2026-04-29)

## Corpus Check
- Corpus is ~2,280 words - fits in a single context window. You may not need a graph.

## Summary
- 74 nodes · 115 edges · 9 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.81)
- Token cost: 1,450 input · 1,100 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Entry Points & Orchestration|Entry Points & Orchestration]]
- [[_COMMUNITY_Database Layer|Database Layer]]
- [[_COMMUNITY_Design Decisions & Rationale|Design Decisions & Rationale]]
- [[_COMMUNITY_Configuration & Catch-up Logic|Configuration & Catch-up Logic]]
- [[_COMMUNITY_PSX Fetcher & Scraper|PSX Fetcher & Scraper]]
- [[_COMMUNITY_Portfolio Goals & Planned Features|Portfolio Goals & Planned Features]]
- [[_COMMUNITY_HTTP Client & PSX API|HTTP Client & PSX API]]
- [[_COMMUNITY_Scheduler & Timing|Scheduler & Timing]]
- [[_COMMUNITY_Config Module|Config Module]]

## God Nodes (most connected - your core abstractions)
1. `PSX Tracker` - 16 edges
2. `fetch_day()` - 9 edges
3. `backfill()` - 9 edges
4. `db()` - 8 edges
5. `refresh_tickers()` - 8 edges
6. `fetcher.py â€” HTTP Scraper & PSX Parser` - 8 edges
7. `main()` - 7 edges
8. `upsert_ohlcv()` - 5 edges
9. `_fetch_symbol_range()` - 5 edges
10. `_catch_up()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `_eod_job()` --calls--> `fetch_day()`  [INFERRED]
  C:\Users\maiqbal\psx_tracker\scheduler.py → C:\Users\maiqbal\psx_tracker\fetcher.py
- `fetcher.py â€” HTTP Scraper & PSX Parser` --uses--> `Dependency: pandas`  [INFERRED]
  CLAUDE.md → requirements.txt
- `cmd_status()` --calls--> `get_connection()`  [INFERRED]
  C:\Users\maiqbal\psx_tracker\main.py → C:\Users\maiqbal\psx_tracker\database.py
- `main()` --calls--> `init_db()`  [INFERRED]
  C:\Users\maiqbal\psx_tracker\main.py → C:\Users\maiqbal\psx_tracker\database.py
- `run()` --calls--> `init_db()`  [INFERRED]
  C:\Users\maiqbal\psx_tracker\scheduler.py → C:\Users\maiqbal\psx_tracker\database.py

## Communities

### Community 0 - "Entry Points & Orchestration"
Cohesion: 0.21
Nodes (11): Pull the full ticker list from PSX and persist any new ones., refresh_tickers(), cmd_status(), main(), Entry point.  Usage:     python main.py                   # Start the live sched, _catch_up(), _eod_job(), Runs as a long-lived process.  Every weekday at EOD_FETCH_TIME (PKT) it fetches (+3 more)

### Community 1 - "Database Layer"
Cohesion: 0.3
Nodes (11): db(), get_connection(), get_known_tickers(), init_db(), last_fetch_date(), log_fetch(), rows: list of dicts with keys symbol, date, open, high, low, close, volume, upsert_ohlcv() (+3 more)

### Community 2 - "Design Decisions & Rationale"
Cohesion: 0.22
Nodes (11): database.py â€” SQLite Schema & Helpers, Design Decision: EOD Only (not intraday), Design Decision: Upsert (INSERT OR ... ON CONFLICT DO UPDATE), End-of-Day OHLCV Data, Rationale: EOD sufficient for portfolio P&L; intraday 500x DB growth with no accuracy gain, Rationale: Re-running a fetch is safe and idempotent, SQLite Database, DB Table: daily_ohlcv (+3 more)

### Community 3 - "Configuration & Catch-up Logic"
Cohesion: 0.25
Nodes (9): Automatic Backfill, Config: BATCH_DELAY (2 seconds), Config: BATCH_SIZE (50), Config: DB_PATH (default psx_data.db), config.py â€” Configuration Tunables, Config: START_DATE (2026-04-29), Design Decision: Batched Fetching (50 symbols, 2s delay), Design Decision: Catch-up on Restart (backfill missed days) (+1 more)

### Community 4 - "PSX Fetcher & Scraper"
Cohesion: 0.32
Nodes (7): backfill(), _fetch_month(), _fetch_symbol_range(), Direct PSX scraper — hits dps.psx.com.pk without relying on the psx package's br, Fetch all months covering from_date..to_date for a single symbol., Fetch all trading days between from_date and to_date (inclusive)., Fetch one month of OHLCV for a single symbol via PSX HTML endpoint.

### Community 5 - "Portfolio Goals & Planned Features"
Cohesion: 0.29
Nodes (8): Dependency: pandas, Planned: Portfolio Layer (holdings, transactions, NAV, returns), Planned: Reporting (P&L charts, sector breakdown, KSE-100 benchmark), Pakistan Stock Exchange (PSX), Portfolio Earnings Tracker, PSX Tracker, Runtime Requirement: Python 3.10+, Weekly Ticker Refresh (Sundays)

### Community 6 - "HTTP Client & PSX API"
Cohesion: 0.32
Nodes (8): Dependency: beautifulsoup4, Dependency: requests, PSX Data Endpoint (dps.psx.com.pk), fetcher.py â€” HTTP Scraper & PSX Parser, Historical Data Endpoint (/historical POST), psx-data-reader PyPI Package, psx.stocks() Broken (PSX renamed TIMEâ†’DATE in 2024), Symbols Endpoint (/symbols JSON)

### Community 7 - "Scheduler & Timing"
Cohesion: 0.5
Nodes (4): Dependency: schedule (Python library), EOD Fetch Time (16:00 PKT), main.py â€” CLI Entry Point, scheduler.py â€” Long-Running Scheduler

### Community 8 - "Config Module"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **19 isolated node(s):** `rows: list of dicts with keys symbol, date, open, high, low, close, volume`, `Direct PSX scraper — hits dps.psx.com.pk without relying on the psx package's br`, `Pull the full ticker list from PSX and persist any new ones.`, `Fetch one month of OHLCV for a single symbol via PSX HTML endpoint.`, `Fetch all months covering from_date..to_date for a single symbol.` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Config Module`** (1 nodes): `config.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PSX Tracker` connect `Portfolio Goals & Planned Features` to `Design Decisions & Rationale`, `Configuration & Catch-up Logic`, `HTTP Client & PSX API`, `Scheduler & Timing`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Why does `Automatic Backfill` connect `Configuration & Catch-up Logic` to `Portfolio Goals & Planned Features`, `Scheduler & Timing`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `fetch_day()` (e.g. with `get_known_tickers()` and `upsert_ohlcv()`) actually correct?**
  _`fetch_day()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `backfill()` (e.g. with `get_known_tickers()` and `upsert_ohlcv()`) actually correct?**
  _`backfill()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `refresh_tickers()` (e.g. with `upsert_tickers()` and `main()`) actually correct?**
  _`refresh_tickers()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `rows: list of dicts with keys symbol, date, open, high, low, close, volume`, `Direct PSX scraper — hits dps.psx.com.pk without relying on the psx package's br`, `Pull the full ticker list from PSX and persist any new ones.` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._