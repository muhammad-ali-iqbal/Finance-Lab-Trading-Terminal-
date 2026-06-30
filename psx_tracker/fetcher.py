"""
Direct PSX scraper — hits dps.psx.com.pk without relying on the psx package's
broken stocks() function (PSX changed the HTML column header from TIME -> DATE
in 2024, breaking psx-data-reader 0.0.6).

tickers() still works fine so we use it for symbol discovery.
"""

import sys
import time
import traceback
from collections import defaultdict
from datetime import date, datetime, timedelta

import pandas as pd
import requests
from bs4 import BeautifulSoup

import psx as _psx                        # only for tickers()
from config import BATCH_SIZE, BATCH_DELAY, SIMTRADER_URL, INTERNAL_SECRET
from database import (
    upsert_ohlcv,
    upsert_tickers,
    get_known_tickers,
    log_fetch,
    set_active_tickers,
)


_HISTORICAL_URL = "https://dps.psx.com.pk/historical"
_MARKET_WATCH_URL = "https://dps.psx.com.pk/market-watch"
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "Mozilla/5.0 (psx-tracker)"})

# Expected OHLCV columns. If a historical page has headers but none of these,
# PSX has changed its HTML layout and we must fail loudly rather than silently
# record zero rows (AVAIL-03).
_OHLCV_COLS = {"OPEN", "HIGH", "LOW", "CLOSE", "VOLUME"}


class ScraperError(Exception):
    """Raised when the PSX page shape is unrecognised (likely a site redesign),
    so the caller can flag the run as failed instead of treating it as 'no data'."""


class PushAuthError(Exception):
    """Raised when the backend rejects the EOD push with 401 — signals an
    INTERNAL_SECRET mismatch, distinct from a transient network failure (SECRET-01)."""


# ---------------------------------------------------------------------------
# Ticker discovery
# ---------------------------------------------------------------------------

def _fetch_active_symbols() -> set[str]:
    """
    Scrape PSX /market-watch for the set of currently quoted (active) series.
    The market-watch page only lists series with a live quote, so it is the
    authoritative "active" set — delisted, suspended, and matured debt series
    are absent.
    """
    try:
        resp = _SESSION.get(_MARKET_WATCH_URL, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"[Fetcher] ERROR fetching market-watch: {e}")
        return set()

    soup = BeautifulSoup(resp.text, "html.parser")
    active: set[str] = set()
    for tr in soup.select("tbody tr"):
        first = tr.select_one("td")
        if first:
            sym = first.get_text(strip=True)
            if sym:
                active.add(sym)
    return active


def refresh_tickers():
    """Pull the full ticker list from PSX and persist any new ones.
    Does NOT touch active/inactive flags — call sync_active_flags() for that."""
    print("[Fetcher] Refreshing ticker list ...")
    try:
        df = _psx.tickers()
        all_symbols = df["symbol"].dropna().str.strip().tolist()
    except Exception as e:
        print(f"[Fetcher] ERROR fetching tickers: {e}")
        return []
    upsert_tickers(all_symbols)
    print(f"[Fetcher] {len(all_symbols)} tickers in registry.")
    return all_symbols


def sync_active_flags():
    """
    Sync active/inactive status from PSX market-watch.
    Only call this on confirmed trading days (weekdays, not PSX holidays) —
    a closed market returns a partial quote list that would incorrectly mark
    listed stocks as inactive.
    """
    from datetime import date as _date
    from config import PSX_HOLIDAYS

    today = _date.today()
    if today.weekday() >= 5:
        print("[Fetcher] sync_active_flags: weekend, skipping.")
        return
    if today in PSX_HOLIDAYS:
        print(f"[Fetcher] sync_active_flags: {today} is a PSX holiday, skipping.")
        return

    active_quoted = _fetch_active_symbols()
    known = set(get_known_tickers(include_inactive=True))
    active = active_quoted & known
    if not active:
        print("[Fetcher] WARN: market-watch returned no known symbols, leaving flags untouched.")
        return

    active_count, inactive_count = set_active_tickers(active)
    print(
        f"[Fetcher] Active flags synced: {active_count} active, {inactive_count} inactive."
    )


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
        # No table at all — typically a symbol with no data for that month.
        return []

    # Header-shape assertion (AVAIL-03): if the page has a header row but none of
    # the expected OHLCV columns, PSX has redesigned the page. Fail loudly so the
    # run is recorded as an error instead of silently logging zero rows.
    upper = {h.upper() for h in headers}
    if not (_OHLCV_COLS & upper):
        raise ScraperError(
            f"PSX historical page for {symbol} {year}-{month:02d} has no OHLCV "
            f"columns (got {headers}); the page layout may have changed."
        )

    # Detect the date column name (changed from TIME -> DATE in 2024)
    date_col = next((h for h in headers if h in ("DATE", "TIME")), None)
    if date_col is None:
        raise ScraperError(
            f"PSX historical page for {symbol} {year}-{month:02d} has OHLCV "
            f"columns but no DATE/TIME column (got {headers})."
        )

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

    print(f"[Fetcher] Fetching EOD data for {target_date} ...")
    symbols = get_known_tickers()
    if not symbols:
        symbols = refresh_tickers()
    if not symbols:
        print("[Fetcher] No tickers to fetch.")
        log_fetch(target_date, "error", 0, error="no tickers in registry")
        _alert(f"fetch {target_date} aborted: ticker registry is empty")
        return False

    total_rows = 0
    all_rows_collected: list[dict] = []
    batches = [symbols[i:i + BATCH_SIZE] for i in range(0, len(symbols), BATCH_SIZE)]

    try:
        for i, batch in enumerate(batches, 1):
            print(f"[Fetcher] Batch {i}/{len(batches)} ({len(batch)} symbols) ...", end="", flush=True)
            batch_rows = []
            for sym in batch:
                batch_rows.extend(_fetch_symbol_range(sym, target_date, target_date))
            saved = upsert_ohlcv(batch_rows)
            all_rows_collected.extend(batch_rows)
            total_rows += saved
            print(f" {saved} rows")
            if i < len(batches):
                time.sleep(BATCH_DELAY)
    except ScraperError as e:
        # PSX layout change detected — record the failure and alert rather than
        # logging a misleading 'ok' with zero rows (AVAIL-03).
        log_fetch(target_date, "error", total_rows, error=str(e))
        _alert(f"fetch {target_date} FAILED — PSX layout change: {e}")
        raise

    # Treat zero / implausibly-low row counts on a confirmed trading day as a
    # failure: a silent empty fetch otherwise looks 'ok' and the reconciler
    # would fill nothing or snapshot stale prices (AVAIL-03).
    expected_min = max(1, int(len(symbols) * 0.5))
    if _is_trading_day(target_date) and total_rows < expected_min:
        log_fetch(target_date, "error", total_rows,
                  error=f"only {total_rows} rows on a trading day (expected ≥ {expected_min})")
        _alert(f"fetch {target_date}: only {total_rows} rows (expected ≥ {expected_min}) — PSX down or layout changed?")
        return False

    log_fetch(target_date, "ok", total_rows)
    print(f"[Fetcher] Done. {total_rows} rows saved for {target_date}.")
    _push_to_simtrader(target_date, all_rows_collected)
    return True


def _is_trading_day(d: date) -> bool:
    """Weekday that is not a known PSX holiday — i.e. a day we expect data."""
    from config import PSX_HOLIDAYS
    return d.weekday() < 5 and d not in PSX_HOLIDAYS


def _alert(message: str) -> None:
    """Emit a high-visibility alert. Today this is a clearly-tagged stderr line
    (greppable by log-based alerting); wire to email/Slack/healthcheck as needed."""
    print(f"[Fetcher][ALERT] {message}", file=sys.stderr, flush=True)


def _push_to_simtrader(target_date: date, rows: list[dict]):
    """Push today's EOD prices to the SimTrader backend so the challenge
    reconciler can fill pending orders. Silently logs and continues on failure."""
    if not rows:
        return
    prices = [
        {
            "symbol": r["symbol"],
            "open":   r["open"]   or 0,
            "high":   r["high"]   or 0,
            "low":    r["low"]    or 0,
            "close":  r["close"]  or 0,
            "volume": int(r["volume"] or 0),
        }
        for r in rows
        if r.get("close")  # skip rows with missing close
    ]
    if not prices:
        return
    payload = {"date": str(target_date), "prices": prices}
    url = f"{SIMTRADER_URL}/api/internal/eod-prices"
    try:
        resp = _SESSION.post(
            url,
            json=payload,
            headers={"X-Internal-Secret": INTERNAL_SECRET},
            timeout=30,
        )
        # Surface an auth failure distinctly from a network failure (SECRET-01):
        # a 401 means the tracker's INTERNAL_SECRET does not match the backend's,
        # which is a misconfiguration that would otherwise silently drop all data.
        if resp.status_code == 401:
            _alert(
                f"backend rejected EOD push with 401 for {target_date} — "
                f"INTERNAL_SECRET mismatch between psx_tracker and the backend."
            )
            raise PushAuthError("backend returned 401 (INTERNAL_SECRET mismatch)")
        resp.raise_for_status()
        data = resp.json()
        print(f"[Fetcher] SimTrader notified: {data.get('ingested', '?')} prices ingested for {target_date}.")
    except PushAuthError:
        raise
    except Exception as e:
        print(f"[Fetcher] WARN: failed to push prices to SimTrader ({url}): {e}", file=sys.stderr)


def backfill(from_date: date, to_date: date | None = None):
    """Fetch all trading days between from_date and to_date (inclusive),
    then push each day's rows to SimTrader so the reconciler can fill orders."""
    if to_date is None:
        to_date = date.today() - timedelta(days=1)

    symbols = get_known_tickers()
    if not symbols:
        symbols = refresh_tickers()

    print(f"[Fetcher] Backfill: {from_date} -> {to_date}, {len(symbols)} symbols")

    # Collect all rows grouped by date
    rows_by_date: dict[str, list[dict]] = defaultdict(list)
    total = 0
    for i, sym in enumerate(symbols, 1):
        if i % 50 == 0:
            print(f"[Fetcher] Backfill progress: {i}/{len(symbols)}")
        try:
            rows = _fetch_symbol_range(sym, from_date, to_date)
            saved = upsert_ohlcv(rows)
            total += saved
            for r in rows:
                rows_by_date[r["date"]].append(r)
        except Exception:
            err = traceback.format_exc()
            log_fetch(from_date, "error", error=f"{sym}: {err}")
            print(f"[Fetcher] Error on {sym}:\n{err}")
        time.sleep(0.3)   # gentle rate limiting per symbol

    log_fetch(from_date, "ok", total)
    print(f"[Fetcher] Backfill complete. {total} rows saved.")

    # Push each day's data to SimTrader so the challenge reconciler can process it
    for day_str in sorted(rows_by_date.keys()):
        _push_to_simtrader(date.fromisoformat(day_str), rows_by_date[day_str])
