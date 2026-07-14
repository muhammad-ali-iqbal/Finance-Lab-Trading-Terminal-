"""
sync_to_simtrader.py
--------------------
One-shot script to bulk-push all historical EOD data from psx_data.db into
the SimTrader backend (PostgreSQL eod_prices table) via the internal API.

Run once to seed the database, then daily automation keeps it current.

Usage:
    python sync_to_simtrader.py              # push everything
    python sync_to_simtrader.py 2026-04-29   # push from this date onwards
"""

import sys
import time
import sqlite3
import requests
from collections import defaultdict
from config import DB_PATH, SIMTRADER_URL, INTERNAL_SECRET

# The internal ingest endpoint is capped at 20 req/min per IP (it's reachable
# through the public proxy, so this stops secret-spraying — see
# simtrader/cmd/server/main.go's internalLimiter). Pace requests comfortably
# under that, and back off + retry on a 429 rather than counting it as failed.
REQUEST_DELAY_SEC = 3.5
RATE_LIMIT_BACKOFF_SEC = 65


def main():
    from_date = sys.argv[1] if len(sys.argv) > 1 else None

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    sql = "SELECT symbol, date, open, high, low, close, volume FROM daily_ohlcv WHERE open IS NOT NULL"
    params: list = []
    if from_date:
        sql += " AND date >= ?"
        params.append(from_date)
    sql += " ORDER BY date, symbol"

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    if not rows:
        print("No rows found in psx_data.db.")
        return

    # Group by date
    by_date: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_date[r["date"]].append({
            "symbol": r["symbol"],
            "open":   float(r["open"]   or 0),
            "high":   float(r["high"]   or 0),
            "low":    float(r["low"]    or 0),
            "close":  float(r["close"]  or 0),
            "volume": int(r["volume"]   or 0),
        })

    dates = sorted(by_date.keys())
    total_dates = len(dates)
    total_rows  = sum(len(v) for v in by_date.values())
    print(f"Found {total_rows:,} rows across {total_dates} trading dates.")
    print(f"Pushing to {SIMTRADER_URL}/api/internal/eod-prices ...\n")

    ok = 0
    failed = 0
    for i, date in enumerate(dates, 1):
        prices = by_date[date]
        while True:
            try:
                resp = requests.post(
                    f"{SIMTRADER_URL}/api/internal/eod-prices",
                    json={"date": date, "prices": prices},
                    headers={"X-Internal-Secret": INTERNAL_SECRET},
                    timeout=30,
                )
                if resp.status_code == 429:
                    print(f"  [{i:>3}/{total_dates}] {date}  429 rate-limited, "
                          f"waiting {RATE_LIMIT_BACKOFF_SEC}s ...")
                    time.sleep(RATE_LIMIT_BACKOFF_SEC)
                    continue
                if resp.ok:
                    ok += 1
                    print(f"  [{i:>3}/{total_dates}] {date}  {len(prices):>4} symbols  ✓")
                else:
                    failed += 1
                    print(f"  [{i:>3}/{total_dates}] {date}  HTTP {resp.status_code}: {resp.text[:80]}")
            except Exception as e:
                failed += 1
                print(f"  [{i:>3}/{total_dates}] {date}  ERROR: {e}")
            break
        time.sleep(REQUEST_DELAY_SEC)

    print(f"\nDone. {ok} dates pushed, {failed} failed.")


if __name__ == "__main__":
    main()
