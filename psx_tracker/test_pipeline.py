"""
End-to-end test suite for psx_tracker.
Tests: DB schema, ticker loading, single-day fetch, backfill, duplicate safety, data integrity.
"""
import sys
import sqlite3
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

PASS = "[PASS]"
FAIL = "[FAIL]"
INFO = "[INFO]"

results = []

def check(name, condition, detail=""):
    status = PASS if condition else FAIL
    msg = f"{status} {name}"
    if detail:
        msg += f" — {detail}"
    print(msg)
    results.append((name, condition))
    return condition


# ── 1. DB SCHEMA ─────────────────────────────────────────────────────────────
print("\n=== 1. Database Schema ===")
from database import init_db, get_connection
init_db()

conn = get_connection()
tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
check("tickers table exists",     "tickers"    in tables)
check("daily_ohlcv table exists", "daily_ohlcv" in tables)
check("fetch_log table exists",   "fetch_log"  in tables)

# Check WAL mode
wal = conn.execute("PRAGMA journal_mode").fetchone()[0]
check("WAL mode enabled", wal == "wal", f"mode={wal}")
conn.close()


# ── 2. TICKER LOADING ────────────────────────────────────────────────────────
print("\n=== 2. Ticker Loading ===")
from fetcher import refresh_tickers
from database import get_known_tickers

syms = get_known_tickers()
check("Tickers already in DB", len(syms) > 0, f"{len(syms)} symbols")

# Re-run refresh (should be idempotent)
refresh_tickers()
syms2 = get_known_tickers()
check("Ticker refresh is idempotent", len(syms2) == len(syms), f"{len(syms)} -> {len(syms2)}")
check("At least 900 tickers", len(syms2) >= 900, f"got {len(syms2)}")

# Spot-check well-known symbols
known = {"OGDC", "PPL", "ENGRO", "HBL", "PSO"}
present = known & set(syms2)
check("Known blue-chips present", len(present) == len(known), f"found {present}")


# ── 3. SINGLE-DAY FETCH ──────────────────────────────────────────────────────
print("\n=== 3. Single-Day Fetch (today) ===")
from fetcher import _fetch_symbol_range
from database import upsert_ohlcv

today = date.today()
rows = _fetch_symbol_range("OGDC", today, today)
check("OGDC fetch returns data",     len(rows) > 0,  f"{len(rows)} rows")

if rows:
    r = rows[0]
    check("Date field correct",          r["date"] == str(today))
    check("Symbol field correct",        r["symbol"] == "OGDC")
    check("Close price is positive",     r["close"] is not None and r["close"] > 0,  f"close={r['close']}")
    check("Open <= High",                r["open"] <= r["high"],   f"O={r['open']} H={r['high']}")
    check("Low  <= Close",               r["low"]  <= r["close"],  f"L={r['low']}  C={r['close']}")
    check("Volume is positive",          r["volume"] is not None and r["volume"] > 0, f"vol={r['volume']}")


# ── 4. UPSERT / DUPLICATE SAFETY ─────────────────────────────────────────────
print("\n=== 4. Upsert / Duplicate Safety ===")
conn = get_connection()
before = conn.execute("SELECT COUNT(*) FROM daily_ohlcv WHERE symbol='OGDC'").fetchone()[0]

# Insert same data twice
upsert_ohlcv(rows)
upsert_ohlcv(rows)

after = conn.execute("SELECT COUNT(*) FROM daily_ohlcv WHERE symbol='OGDC'").fetchone()[0]
conn.close()
check("No duplicate rows on repeated upsert", after == before or after == before + 1,
      f"rows before={before} after={after}")


# ── 5. BACKFILL (last 3 trading days) ────────────────────────────────────────
print("\n=== 5. Backfill (3-symbol spot-check, last 5 days) ===")
from fetcher import backfill as do_backfill
from database import last_fetch_date

end   = today - timedelta(days=1)
start = end - timedelta(days=4)   # covers ~3 trading days across a weekend

# Backfill a tiny subset manually to keep test fast
test_syms = ["OGDC", "PPL", "ENGRO"]
all_rows = []
for s in test_syms:
    r = _fetch_symbol_range(s, start, end)
    all_rows.extend(r)
    print(f"  {INFO} {s}: {len(r)} rows ({start} to {end})")

saved = upsert_ohlcv(all_rows)
check("Backfill rows saved",          saved >= 0,           f"{saved} rows")
check("At least some data returned",  len(all_rows) > 0,    f"{len(all_rows)} total rows")

# Verify they're actually in the DB
conn = get_connection()
db_count = conn.execute(
    "SELECT COUNT(*) FROM daily_ohlcv WHERE symbol IN ('OGDC','PPL','ENGRO') AND date BETWEEN ? AND ?",
    (str(start), str(end))
).fetchone()[0]
conn.close()
check("Backfilled rows queryable in DB", db_count > 0, f"{db_count} rows in range")


# ── 6. DATA INTEGRITY ────────────────────────────────────────────────────────
print("\n=== 6. Data Integrity ===")
conn = get_connection()

# No rows with close <= 0
bad_close = conn.execute("SELECT COUNT(*) FROM daily_ohlcv WHERE close IS NOT NULL AND close <= 0").fetchone()[0]
check("No zero/negative close prices", bad_close == 0, f"{bad_close} bad rows")

# No rows where high < low
bad_hl = conn.execute("SELECT COUNT(*) FROM daily_ohlcv WHERE high < low").fetchone()[0]
check("No rows where high < low", bad_hl == 0, f"{bad_hl} bad rows")

# No duplicate (symbol, date) pairs
dup = conn.execute(
    "SELECT COUNT(*) FROM (SELECT symbol, date, COUNT(*) c FROM daily_ohlcv GROUP BY symbol, date HAVING c > 1)"
).fetchone()[0]
check("No duplicate (symbol, date) pairs", dup == 0, f"{dup} duplicates")

total = conn.execute("SELECT COUNT(*) FROM daily_ohlcv").fetchone()[0]
conn.close()
print(f"  {INFO} Total rows in DB: {total:,}")


# ── 7. FETCH LOG ─────────────────────────────────────────────────────────────
print("\n=== 7. Fetch Log ===")
conn = get_connection()
log_count = conn.execute("SELECT COUNT(*) FROM fetch_log").fetchone()[0]
check("Fetch log has entries", log_count > 0, f"{log_count} log entries")
last_log = conn.execute("SELECT status, rows_saved FROM fetch_log ORDER BY id DESC LIMIT 1").fetchone()
check("Last log entry is ok", last_log and last_log[0] == "ok", f"status={last_log[0] if last_log else 'none'}")
conn.close()


# ── SUMMARY ──────────────────────────────────────────────────────────────────
print("\n" + "="*50)
passed = sum(1 for _, ok in results if ok)
failed = sum(1 for _, ok in results if not ok)
print(f"Results: {passed} passed, {failed} failed out of {len(results)} checks")
if failed:
    print("\nFailed checks:")
    for name, ok in results:
        if not ok:
            print(f"  {FAIL} {name}")
sys.exit(0 if failed == 0 else 1)
