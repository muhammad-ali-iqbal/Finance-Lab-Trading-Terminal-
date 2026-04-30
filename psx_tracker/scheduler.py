"""
Runs as a long-lived process.  Every weekday at EOD_FETCH_TIME (PKT) it
fetches the day's OHLCV for all PSX stocks and writes it to the database.

Also does a ticker refresh every Sunday so new listings are picked up.
"""

import signal
import sys
import time
from datetime import date

import schedule

from config import EOD_FETCH_TIME, START_DATE
from database import init_db, last_fetch_date
from fetcher import fetch_day, refresh_tickers, sync_active_flags


def _eod_job():
    today = date.today()
    if today.weekday() >= 5:  # Sat/Sun — PSX is closed
        print(f"[Scheduler] Weekend ({today}), skipping.")
        return
    fetch_day(today)
    # Sync active flags after the fetch — only runs on weekdays that are not
    # PSX holidays (the guard lives inside sync_active_flags).
    sync_active_flags()


def _ticker_refresh_job():
    # Sunday job: just refresh the symbol list for new listings.
    # Active-flag sync is intentionally excluded here — Sunday is not a
    # trading day so market-watch would give an unreliable active set.
    refresh_tickers()


def _catch_up():
    """If the process was offline, backfill missing trading days."""
    from fetcher import backfill

    last = last_fetch_date()
    if last is None:
        # First ever run — start from START_DATE
        start = START_DATE
    else:
        from datetime import timedelta
        start = date.fromisoformat(last) + timedelta(days=1)

    today = date.today()
    if start <= today:
        print(f"[Scheduler] Catching up from {start} to {today} ...")
        backfill(start, today)
    else:
        print("[Scheduler] Database is up to date.")


def run():
    init_db()
    refresh_tickers()
    sync_active_flags()   # guarded internally — skips weekends and holidays
    _catch_up()

    # Daily EOD fetch (Mon–Fri checked inside the job)
    schedule.every().day.at(EOD_FETCH_TIME).do(_eod_job)

    # Weekly ticker refresh (Sunday midnight)
    schedule.every().sunday.at("00:00").do(_ticker_refresh_job)

    print(f"[Scheduler] Running. EOD fetch scheduled at {EOD_FETCH_TIME} PKT.")
    print("[Scheduler] Press Ctrl+C to stop.")

    def _stop(sig, frame):
        print("\n[Scheduler] Stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    while True:
        schedule.run_pending()
        time.sleep(30)
