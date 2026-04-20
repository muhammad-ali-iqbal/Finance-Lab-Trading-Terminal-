#!/usr/bin/env python3
"""
psx_to_simtrader.py
===================
Converts PSX intraday data exports to SimTrader CSV format.

Input: one tab-separated .txt file per symbol (e.g. PSO.PK.txt), structured as:
  Exchange Date  Exchange Time  Local Date  Local Time  Close  Net  %Chg  Open  Low  High  Volume  Trade Price

Rows may be in any order (newest-first is fine). Multiple dates per file are supported.
The symbol is taken from the filename — PSO.PK.txt → PSO.

Output (SimTrader format):
  timestamp,symbol,open,high,low,close,volume
  All timestamps in UTC, sorted by timestamp then symbol.

Usage:
  # One symbol
  python psx_to_simtrader.py -f raw/PSO.PK.txt -o simulation.csv -d 2026-04-03

  # Whole directory (one file per symbol)
  python psx_to_simtrader.py -i ./raw -o simulation.csv -d 2026-04-03

  # Skip forward-fill of missing bars
  python psx_to_simtrader.py -i ./raw -o simulation.csv -d 2026-04-03 --no-fill
"""

import sys
import csv
import argparse
from datetime import datetime, date, timedelta
from pathlib import Path


# PSX regular session in PKT (UTC+5)
SESSION_START = (9,  30)   # inclusive
SESSION_END   = (15, 30)   # exclusive
PKT_OFFSET    = timedelta(hours=5)
BARS_PER_DAY  = 360        # 09:30–15:29 = 360 one-minute bars


# ── Helpers ───────────────────────────────────────────────────────────────────

def symbol_from_path(path: Path) -> str:
    """PSO.PK.txt  →  PSO   (strips exchange suffix like .PK, .KAR)"""
    return path.stem.split(".")[0].upper()


def parse_row_date(s: str) -> date:
    return datetime.strptime(s.strip(), "%d-%b-%Y").date()


def in_session(time_str: str) -> bool:
    h, m = map(int, time_str.strip().split(":"))
    mins = h * 60 + m
    lo   = SESSION_START[0] * 60 + SESSION_START[1]
    hi   = SESSION_END[0]   * 60 + SESSION_END[1]
    return lo <= mins < hi


def pkt_to_utc(d: date, time_str: str) -> str:
    h, m = map(int, time_str.strip().split(":"))
    return (datetime(d.year, d.month, d.day, h, m) - PKT_OFFSET).strftime("%Y-%m-%dT%H:%M:%SZ")


def pf(s: str) -> float:
    return float(s.strip().replace(",", ""))


# ── Core ──────────────────────────────────────────────────────────────────────

def parse_file(path: Path, symbol: str, trade_date: date) -> list[dict]:
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read().lstrip("\ufeff")

    reader = csv.DictReader(text.splitlines(), delimiter="\t")
    rows = []

    for lineno, row in enumerate(reader, start=2):
        try:
            if parse_row_date(row["Exchange Date"]) != trade_date:
                continue
        except (ValueError, KeyError):
            continue

        time_str = row.get("Exchange Time", "").strip()
        if not in_session(time_str):
            continue

        try:
            o = pf(row["Open"])
            h = pf(row["High"])
            l = pf(row["Low"])
            c = pf(row["Close"])
            v = int(pf(row["Volume"]))
        except (ValueError, KeyError):
            print(f"  [WARN] line {lineno}: parse error — skipping")
            continue

        if min(o, h, l, c) <= 0:
            continue

        rows.append({
            "timestamp": pkt_to_utc(trade_date, time_str),
            "symbol":    symbol,
            "open":      round(o,             4),
            "high":      round(max(h, o, c),  4),
            "low":       round(min(l, o, c),  4),
            "close":     round(c,             4),
            "volume":    v,
        })

    rows.sort(key=lambda r: r["timestamp"])
    return rows


def forward_fill(rows: list[dict], symbol: str, trade_date: date) -> list[dict]:
    by_ts = {r["timestamp"]: r for r in rows}
    start = datetime(trade_date.year, trade_date.month, trade_date.day,
                     *SESSION_START) - PKT_OFFSET
    end   = datetime(trade_date.year, trade_date.month, trade_date.day,
                     *SESSION_END)   - PKT_OFFSET

    filled, last = [], rows[0]["open"]
    ts = start
    while ts < end:
        key = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
        if key in by_ts:
            bar = by_ts[key]
            last = bar["close"]
            filled.append(bar)
        else:
            filled.append({"timestamp": key, "symbol": symbol,
                           "open": last, "high": last, "low": last, "close": last, "volume": 0})
        ts += timedelta(minutes=1)

    gaps = len(filled) - len(rows)
    if gaps:
        print(f"  Forward-filled {gaps} missing bar(s)  ({len(filled)}/{BARS_PER_DAY} total)")
    return filled


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="Convert PSX intraday exports to SimTrader CSV")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("-i", "--input-dir",  help="Directory of .txt files (one per symbol)")
    src.add_argument("-f", "--input-file", help="Single .txt file")
    ap.add_argument("-o", "--output",   required=True, help="Output CSV path")
    ap.add_argument("-d", "--date",     required=True, help="Trading date  YYYY-MM-DD")
    ap.add_argument("--no-fill", action="store_true",  help="Skip forward-fill of missing bars")
    args = ap.parse_args()

    try:
        trade_date = date.fromisoformat(args.date)
    except ValueError:
        sys.exit(f"ERROR: invalid date '{args.date}' — use YYYY-MM-DD")

    files = (sorted(Path(args.input_dir).glob("*.txt"), key=symbol_from_path)
             if args.input_dir else [Path(args.input_file)])

    if not files:
        sys.exit(f"ERROR: no .txt files found in '{args.input_dir}'")

    print(f"\nPSX to SimTrader  |  {trade_date}  |  {len(files)} file(s)  ->  {args.output}")

    all_rows, failed = [], []

    for path in files:
        symbol = symbol_from_path(path)
        print(f"\n{symbol}  ({path.name})")

        rows = parse_file(path, symbol, trade_date)
        if not rows:
            print(f"  [ERROR] no data for {trade_date} — check --date or file contents")
            failed.append(symbol)
            continue

        print(f"  Parsed {len(rows)} bars")

        if not args.no_fill:
            rows = forward_fill(rows, symbol, trade_date)

        all_rows.extend(rows)
        print(f"  OK")

    if not all_rows:
        sys.exit("\nERROR: nothing to write — no valid data found.")

    all_rows.sort(key=lambda r: (r["timestamp"], r["symbol"]))

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["timestamp", "symbol", "open", "high", "low", "close", "volume"])
        w.writeheader()
        w.writerows(all_rows)

    symbols = sorted({r["symbol"] for r in all_rows})
    print(f"\n{'='*50}")
    print(f"Output  : {out}")
    print(f"Symbols : {len(symbols)}  ({', '.join(symbols)})")
    print(f"Rows    : {len(all_rows):,}")
    if failed:
        print(f"Failed  : {', '.join(failed)}")
    print(f"{'='*50}")
    print(f"Next: validate then upload via the SimTrader admin panel.\n")


if __name__ == "__main__":
    main()
