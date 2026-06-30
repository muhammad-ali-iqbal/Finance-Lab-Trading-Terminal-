"""
Runs as a long-lived process.  Every weekday at EOD_FETCH_TIME (Asia/Karachi)
it fetches the day's OHLCV for all PSX stocks and writes it to the database.

Also does a ticker refresh every Sunday so new listings are picked up.
"""

import os
import signal
import sys
import time
from datetime import date, timedelta

import schedule

from config import (
    EOD_FETCH_TIME,
    EOD_RETRY_ATTEMPTS,
    EOD_RETRY_DELAY_MIN,
    MAX_BACKFILL_DAYS,
    START_DATE,
    TIMEZONE,
)
from database import init_db, last_fetch_date
from fetcher import ScraperError, backfill, fetch_day, refresh_tickers, sync_active_flags


def _force_timezone():
    """Pin the process to PSX local time so schedule.every().day.at(...) fires
    at the right wall-clock moment even on a UTC cloud host (AVAIL-04)."""
    os.environ["TZ"] = TIMEZONE
    if hasattr(time, "tzset"):
        time.tzset()
        print(f"[Scheduler] Timezone pinned to {TIMEZONE}.")
    else:
        print(f"[Scheduler] WARN: time.tzset() unavailable; relying on host TZ for {TIMEZONE}.")


def _eod_job():
    today = date.today()
    if today.weekday() >= 5:  # Sat/Sun — PSX is closed
        print(f"[Scheduler] Weekend ({today}), skipping.")
        return

    # Try the fetch, with bounded same-day retries for a transient empty/failed
    # result (e.g. PSX slow to publish close data). A layout change raises
    # ScraperError and is not retried — retrying cannot fix a redesign (AVAIL-04).
    ok = False
    for attempt in range(1, EOD_RETRY_ATTEMPTS + 1):
        try:
            ok = bool(fetch_day(today))
        except ScraperError as e:
            print(f"[Scheduler] EOD fetch failed (layout change), not retrying: {e}")
            ok = False
            break
        if ok:
            break
        if attempt < EOD_RETRY_ATTEMPTS:
            print(f"[Scheduler] EOD fetch attempt {attempt} empty/failed; "
                  f"retrying in {EOD_RETRY_DELAY_MIN} min ...")
            time.sleep(EOD_RETRY_DELAY_MIN * 60)

    # Sync active flags after the fetch — only runs on weekdays that are not
    # PSX holidays (the guard lives inside sync_active_flags).
    sync_active_flags()


def _ticker_refresh_job():
    # Sunday job: just refresh the symbol list for new listings.
    # Active-flag sync is intentionally excluded here — Sunday is not a
    # trading day so market-watch would give an unreliable active set.
    refresh_tickers()


def _catch_up():
    """If the process was offline, backfill missing trading days — bounded so a
    long outage does not trigger an unbounded multi-month grind (AVAIL-04)."""
    last = last_fetch_date()
    if last is None:
        start = START_DATE  # first ever run
    else:
        start = date.fromisoformat(last) + timedelta(days=1)

    today = date.today()
    if start > today:
        print("[Scheduler] Database is up to date.")
        return

    gap_days = (today - start).days
    if gap_days > MAX_BACKFILL_DAYS:
        capped_start = today - timedelta(days=MAX_BACKFILL_DAYS)
        print(f"[Scheduler][ALERT] Gap of {gap_days} days exceeds cap "
              f"({MAX_BACKFILL_DAYS}); backfilling only {capped_start}..{today}. "
              f"Range {start}..{capped_start - timedelta(days=1)} was skipped — "
              f"run a manual backfill if you need it.", file=sys.stderr, flush=True)
        start = capped_start

    print(f"[Scheduler] Catching up from {start} to {today} ...")
    try:
        backfill(start, today)
    except ScraperError as e:
        print(f"[Scheduler][ALERT] Catch-up backfill aborted (PSX layout change): {e}",
              file=sys.stderr, flush=True)


def run():
    _force_timezone()
    init_db()
    refresh_tickers()
    sync_active_flags()   # guarded internally — skips weekends and holidays
    _catch_up()

    # Daily EOD fetch (Mon–Fri checked inside the job)
    schedule.every().day.at(EOD_FETCH_TIME).do(_eod_job)

    # Weekly ticker refresh (Sunday midnight)
    schedule.every().sunday.at("00:00").do(_ticker_refresh_job)

    print(f"[Scheduler] Running. EOD fetch scheduled at {EOD_FETCH_TIME} {TIMEZONE}.")
    print("[Scheduler] Press Ctrl+C to stop.")

    def _stop(sig, frame):
        print("\n[Scheduler] Stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    while True:
        schedule.run_pending()
        time.sleep(30)
