"""
Entry point.

Usage:
    python main.py                   # Start the live scheduler (runs forever)
    python main.py fetch             # Fetch today's EOD data once and exit
    python main.py backfill YYYY-MM-DD [YYYY-MM-DD]  # Backfill a date range
    python main.py tickers           # Refresh the ticker list and exit
    python main.py status            # Show DB stats and exit
"""

import sys
from datetime import date


def cmd_status():
    from database import get_connection
    conn = get_connection()
    tickers = conn.execute("SELECT COUNT(*) FROM tickers").fetchone()[0]
    rows    = conn.execute("SELECT COUNT(*) FROM daily_ohlcv").fetchone()[0]
    last    = conn.execute("SELECT MAX(date) FROM daily_ohlcv").fetchone()[0]
    first   = conn.execute("SELECT MIN(date) FROM daily_ohlcv").fetchone()[0]
    conn.close()
    print(f"Tickers tracked : {tickers}")
    print(f"OHLCV rows      : {rows:,}")
    print(f"Date range      : {first} to {last}")


def main():
    args = sys.argv[1:]

    if not args or args[0] == "run":
        from scheduler import run
        run()

    elif args[0] == "fetch":
        from database import init_db
        from fetcher import fetch_day
        init_db()
        fetch_day(date.today())

    elif args[0] == "backfill":
        from database import init_db
        from fetcher import backfill
        init_db()
        if len(args) < 2:
            print("Usage: python main.py backfill YYYY-MM-DD [YYYY-MM-DD]")
            sys.exit(1)
        from_date = date.fromisoformat(args[1])
        to_date   = date.fromisoformat(args[2]) if len(args) > 2 else None
        backfill(from_date, to_date)

    elif args[0] == "tickers":
        from database import init_db
        from fetcher import refresh_tickers
        init_db()
        refresh_tickers()

    elif args[0] == "status":
        from database import init_db
        init_db()
        cmd_status()

    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
