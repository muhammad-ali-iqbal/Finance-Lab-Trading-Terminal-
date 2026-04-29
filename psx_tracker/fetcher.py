"""
Direct PSX scraper — hits dps.psx.com.pk without relying on the psx package's
broken stocks() function (PSX changed the HTML column header from TIME → DATE
in 2024, breaking psx-data-reader 0.0.6).

tickers() still works fine so we use it for symbol discovery.
"""

import time
import traceback
from collections import defaultdict
from datetime import date, datetime, timedelta

import pandas as pd
import requests
from bs4 import BeautifulSoup

import psx as _psx                        # only for tickers()
from config import BATCH_SIZE, BATCH_DELAY
from database import upsert_ohlcv, upsert_tickers, get_known_tickers, log_fetch


_HISTORICAL_URL = "https://dps.psx.com.pk/historical"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Mozilla/5.0 (psx-tracker)"})


# ---------------------------------------------------------------------------
# Ticker discovery
# ---------------------------------------------------------------------------

def refresh_tickers():
    """Pull the full ticker list from PSX and persist any new ones."""
    print("[Fetcher] Refreshing ticker list …")
    try:
        df = _psx.tickers()          # returns a DataFrame
        symbols = df["symbol"].dropna().str.strip().tolist()
    except Exception as e:
        print(f"[Fetcher] ERROR fetching tickers: {e}")
        return []
    upsert_tickers(symbols)
    print(f"[Fetcher] {len(symbols)} tickers available.")
    return symbols


# ---------------------------------------------------------------------------
# OHLCV fetching
# ---------------------------------------------------------------------------

def _fetch_month(symbol: str, year: int, month: int) -> list[dict]:
    """Fetch one month of OHLCV for a single symbol via PSX HTML endpoint."""
    try:
        resp = _SESSION.post(
            _HISTORICAL_URL,
            data={"month": month, "year": year, "symbol": symbol},
            timeout=15,
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[Fetcher] HTTP error for {symbol} {year}-{month:02d}: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    headers = [th.get_text(strip=True) for th in soup.select("th")]
    if not headers:
        return []

    # Detect the date column name (changed from TIME → DATE in 2024)
    date_col = next((h for h in headers if h in ("DATE", "TIME")), None)
    if date_col is None:
        return []

    rows = []
    for tr in soup.select("tr"):
        cells = [td.get_text(strip=True) for td in tr.select("td")]
        if not cells or len(cells) < len(headers):
            continue

        record = dict(zip(headers, cells))
        try:
            d = datetime.strptime(record[date_col], "%b %d, %Y").date()
        except ValueError:
            continue

        def _num(key):
            try:
                return float(record.get(key, "").replace(",", "") or 0)
            except ValueError:
                return None

        rows.append({
            "symbol": symbol,
            "date":   str(d),
            "open":   _num("OPEN"),
            "high":   _num("HIGH"),
            "low":    _num("LOW"),
            "close":  _num("CLOSE"),
            "volume": _num("VOLUME"),
        })

    return rows


def _fetch_symbol_range(symbol: str, from_date: date, to_date: date) -> list[dict]:
    """Fetch all months covering from_date..to_date for a single symbol."""
    all_rows: list[dict] = []
    # Enumerate unique (year, month) pairs in the range
    seen = set()
    current = from_date.replace(day=1)
    while current <= to_date:
        key = (current.year, current.month)
        if key not in seen:
            seen.add(key)
            all_rows.extend(_fetch_month(symbol, *key))
        current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)

    # Filter to only dates within [from_date, to_date]
    return [r for r in all_rows if from_date <= date.fromisoformat(r["date"]) <= to_date]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def fetch_day(target_date: date | None = None):
    """
    Fetch EOD OHLCV for all known tickers on target_date.
    Defaults to yesterday if called before market data is confirmed published.
    """
    if target_date is None:
        target_date = date.today() - timedelta(days=1)

    print(f"[Fetcher] Fetching EOD data for {target_date} …")
    symbols = get_known_tickers()
    if not symbols:
        symbols = refresh_tickers()
    if not symbols:
        print("[Fetcher] No tickers to fetch.")
        return

    total_rows = 0
    batches = [symbols[i:i + BATCH_SIZE] for i in range(0, len(symbols), BATCH_SIZE)]

    for i, batch in enumerate(batches, 1):
        print(f"[Fetcher] Batch {i}/{len(batches)} ({len(batch)} symbols) …", end="", flush=True)
        batch_rows = []
        for sym in batch:
            batch_rows.extend(_fetch_symbol_range(sym, target_date, target_date))
        saved = upsert_ohlcv(batch_rows)
        total_rows += saved
        print(f" {saved} rows")
        if i < len(batches):
            time.sleep(BATCH_DELAY)

    log_fetch(target_date, "ok", total_rows)
    print(f"[Fetcher] Done. {total_rows} rows saved for {target_date}.")


def backfill(from_date: date, to_date: date | None = None):
    """Fetch all trading days between from_date and to_date (inclusive)."""
    if to_date is None:
        to_date = date.today() - timedelta(days=1)

    symbols = get_known_tickers()
    if not symbols:
        symbols = refresh_tickers()

    print(f"[Fetcher] Backfill: {from_date} → {to_date}, {len(symbols)} symbols")

    # Fetch per-symbol across the full range (one call per month per symbol)
    total = 0
    for i, sym in enumerate(symbols, 1):
        if i % 50 == 0:
            print(f"[Fetcher] Backfill progress: {i}/{len(symbols)}")
        try:
            rows = _fetch_symbol_range(sym, from_date, to_date)
            saved = upsert_ohlcv(rows)
            total += saved
        except Exception:
            err = traceback.format_exc()
            log_fetch(from_date, "error", error=f"{sym}: {err}")
            print(f"[Fetcher] Error on {sym}:\n{err}")
        time.sleep(0.3)   # gentle rate limiting per symbol

    log_fetch(from_date, "ok", total)
    print(f"[Fetcher] Backfill complete. {total} rows saved.")
