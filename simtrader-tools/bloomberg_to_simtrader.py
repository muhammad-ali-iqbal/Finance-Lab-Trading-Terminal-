#!/usr/bin/env python3
"""
bloomberg_to_simtrader.py
=========================
Transforms Bloomberg "Intraday OHLC Table" copy-paste exports
into the exact CSV format the SimTrader ingestion service expects.

BLOOMBERG EXPORT COLUMNS (what you copy from the screen):
  Time Interval | Close | Net Change | Open | High | Low | Tick Count | Volume

SIMTRADER FORMAT (what this script produces):
  timestamp,symbol,open,high,low,close,volume

HOW TO USE
----------
Step 1 — In Bloomberg for each PSX stock:
    Type ticker e.g.  LUCK PA Equity  → press Enter
    Type  GP  → press Enter  (opens intraday chart)
    Press  97  (Export To Excel) OR manually:
        - Type  IOHLC  → Enter  (Intraday OHLC Table)
        - Set Period: 1 minute
        - Set Range: your chosen date → your chosen date
        - Highlight ALL rows (Ctrl+A) → Ctrl+C to copy
        - Paste into a .txt file and save as  LUCK.txt

Step 2 — Run this script:
    python bloomberg_to_simtrader.py --input-dir ./raw --output simulation.csv --date 2026-04-01

Step 3 — Upload simulation.csv through the SimTrader admin panel.

DIRECTORY STRUCTURE
-------------------
raw/
  LUCK.txt      ← paste from Bloomberg for Lucky Cement
  ENGRO.txt     ← paste from Bloomberg for Engro Corp
  HBL.txt       ← paste from Bloomberg for Habib Bank
  ...           ← one file per symbol
"""

import os
import re
import sys
import csv
import argparse
from datetime import datetime, date
from pathlib import Path
from typing import Optional


# ── Config ────────────────────────────────────────────────────────────────────

# PSX session: 09:30 to 15:30 PKT (UTC+5)
# Bloomberg timestamps will be in PKT (local terminal time).
# We store everything as UTC in the database, so we subtract 5 hours.
PKT_OFFSET_HOURS = 5

# PSX trading session in PKT
SESSION_START_PKT = "18:30"
SESSION_END_PKT   = "20:00"

# Minimum volume per bar to be considered valid (filters pre-market noise)
MIN_VOLUME = 0


# ── Bloomberg raw text parser ──────────────────────────────────────────────────

def parse_bloomberg_paste(text: str, symbol: str, trade_date: date) -> list[dict]:
    """
    Parse the raw text copied from Bloomberg's Intraday OHLC Table.

    Bloomberg format (tab or multi-space separated):
      Time Interval    Close    Net Change    Open    High    Low    Tick Count    Volume
      18:30 - 18:31    254.19   +.40          254.08  256.18  254.00  1527         776,409

    Note: Bloomberg shows time ranges like "18:30 - 18:31".
    We use the START time of each bar as the canonical timestamp.
    Times are in PKT (UTC+5). We convert to UTC for storage.
    """
    rows = []
    lines = text.strip().splitlines()

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Skip header lines
        if any(skip in line for skip in [
            "Time Interval", "Summary", "Period", "Range",
            "Apple", "AAPL", "Equity", "As of", "Refresh"
        ]):
            continue

        # Match the time range pattern: "HH:MM - HH:MM" at the start
        # Bloomberg uses either tab separation or multiple spaces
        time_match = re.match(r'^(\d{1,2}:\d{2})\s*[-–]\s*\d{1,2}:\d{2}', line)
        if not time_match:
            continue

        bar_start_pkt = time_match.group(1)  # e.g. "18:30" in PKT

        # Filter to PSX session only
        if not _in_session(bar_start_pkt):
            continue

        # Extract remaining columns — split on 2+ spaces or tabs
        remainder = line[time_match.end():].strip()
        cols = re.split(r'\s{2,}|\t', remainder)
        cols = [c.strip() for c in cols if c.strip()]

        # Bloomberg column order after time interval:
        # Close | Net Change | Open | High | Low | Tick Count | Volume
        if len(cols) < 6:
            continue  # not enough columns, skip

        try:
            close      = _parse_price(cols[0])
            # cols[1] is Net Change — skip it
            open_      = _parse_price(cols[2])
            high       = _parse_price(cols[3])
            low        = _parse_price(cols[4])
            # cols[5] is Tick Count — skip it
            volume     = _parse_volume(cols[6]) if len(cols) >= 7 else 0
        except (ValueError, IndexError):
            # If column parsing fails, try alternate order without Net Change
            try:
                close  = _parse_price(cols[0])
                open_  = _parse_price(cols[1])
                high   = _parse_price(cols[2])
                low    = _parse_price(cols[3])
                volume = _parse_volume(cols[5]) if len(cols) >= 6 else 0
            except (ValueError, IndexError):
                print(f"  [WARN] Could not parse line: {line[:80]}")
                continue

        # Validate OHLC logic
        if not _valid_ohlc(open_, high, low, close):
            print(f"  [WARN] Invalid OHLC at {bar_start_pkt} for {symbol}: "
                  f"O={open_} H={high} L={low} C={close} — skipping")
            continue

        if close <= 0 or open_ <= 0:
            print(f"  [WARN] Zero/negative price at {bar_start_pkt} for {symbol} — skipping")
            continue

        if volume < MIN_VOLUME:
            continue

        # Convert PKT → UTC
        timestamp_utc = _pkt_to_utc(trade_date, bar_start_pkt)

        rows.append({
            "timestamp": timestamp_utc,
            "symbol":    symbol.upper(),
            "open":      round(open_,  4),
            "high":      round(high,   4),
            "low":       round(low,    4),
            "close":     round(close,  4),
            "volume":    int(volume),
        })

    return rows


# ── Forward-fill missing bars ─────────────────────────────────────────────────

def forward_fill_gaps(rows: list[dict], symbol: str, trade_date: date) -> list[dict]:
    """
    PSX session = 09:30 to 15:29 PKT = 04:30 to 10:29 UTC
    That's exactly 360 one-minute bars per symbol per day.
    Any missing bars are forward-filled: carry previous close as OHLC, volume=0.
    This prevents holes in the chart during low-liquidity periods.
    """
    if not rows:
        return rows

    from datetime import timedelta

    # Build a set of existing timestamps
    existing = {r["timestamp"] for r in rows}
    by_ts = {r["timestamp"]: r for r in rows}

    # Generate every expected bar timestamp (UTC)
    session_start_dt = _pkt_to_datetime(trade_date, SESSION_START_PKT)
    session_end_dt   = _pkt_to_datetime(trade_date, SESSION_END_PKT)

    all_bars = []
    ts = session_start_dt
    last_close = rows[0]["open"]  # seed with first open price

    while ts < session_end_dt:
        ts_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
        if ts_str in by_ts:
            bar = by_ts[ts_str]
            last_close = bar["close"]
            all_bars.append(bar)
        else:
            # Forward-fill: flat bar at last known price
            all_bars.append({
                "timestamp": ts_str,
                "symbol":    symbol.upper(),
                "open":      last_close,
                "high":      last_close,
                "low":       last_close,
                "close":     last_close,
                "volume":    0,
            })
        ts += timedelta(minutes=1)

    filled = len(all_bars) - len(rows)
    if filled > 0:
        print(f"  [INFO] {symbol}: forward-filled {filled} missing bars")

    return all_bars


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convert Bloomberg OHLC copy-paste files to SimTrader CSV format"
    )
    parser.add_argument(
        "--input-dir", "-i",
        required=True,
        help="Directory containing one .txt file per symbol (e.g. LUCK.txt, ENGRO.txt)"
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="Output CSV file path (e.g. simulation_2026_04_01.csv)"
    )
    parser.add_argument(
        "--date", "-d",
        required=True,
        help="Trading date in YYYY-MM-DD format (e.g. 2026-04-01)"
    )
    parser.add_argument(
        "--no-fill",
        action="store_true",
        help="Disable forward-filling of missing bars"
    )
    args = parser.parse_args()

    # Parse date
    try:
        trade_date = date.fromisoformat(args.date)
    except ValueError:
        print(f"ERROR: Invalid date format '{args.date}'. Use YYYY-MM-DD.")
        sys.exit(1)

    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"ERROR: Input directory '{input_dir}' does not exist.")
        sys.exit(1)

    # Find all .txt files
    txt_files = sorted(input_dir.glob("*.txt"))
    if not txt_files:
        print(f"ERROR: No .txt files found in '{input_dir}'.")
        print("  Create one file per symbol, named SYMBOL.txt (e.g. LUCK.txt)")
        sys.exit(1)

    print(f"\nSimTrader Bloomberg Converter")
    print(f"Date: {trade_date}  |  Input: {input_dir}  |  Output: {args.output}")
    print(f"Found {len(txt_files)} symbol file(s)\n")

    all_rows = []
    errors   = []

    for txt_file in txt_files:
        symbol = txt_file.stem.upper()  # filename without extension = symbol
        print(f"Processing {symbol}...")

        try:
            text = txt_file.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"  [ERROR] Could not read file: {e}")
            errors.append(symbol)
            continue

        rows = parse_bloomberg_paste(text, symbol, trade_date)

        if not rows:
            print(f"  [ERROR] No valid bars found for {symbol}. Check the file format.")
            errors.append(symbol)
            continue

        print(f"  Parsed {len(rows)} bars")

        if not args.no_fill:
            rows = forward_fill_gaps(rows, symbol, trade_date)

        all_rows.extend(rows)
        print(f"  ✓ {symbol}: {len(rows)} bars ready")

    if not all_rows:
        print("\nERROR: No data to write. Check your input files.")
        sys.exit(1)

    # Sort by timestamp then symbol (deterministic ordering)
    all_rows.sort(key=lambda r: (r["timestamp"], r["symbol"]))

    # Write output CSV
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["timestamp", "symbol", "open", "high", "low", "close", "volume"]
        )
        writer.writeheader()
        writer.writerows(all_rows)

    # Summary
    symbols_done = sorted({r["symbol"] for r in all_rows})
    print(f"\n{'='*55}")
    print(f"✓ Output written to: {output_path}")
    print(f"  Symbols:    {len(symbols_done)} ({', '.join(symbols_done)})")
    print(f"  Total rows: {len(all_rows):,}")
    print(f"  Date:       {trade_date}")

    if errors:
        print(f"\n⚠ Failed symbols ({len(errors)}): {', '.join(errors)}")
        print("  Check those .txt files — they may have unexpected formatting.")
    else:
        print(f"\n✓ All symbols processed successfully.")

    print(f"\nNext step: Upload '{output_path}' through the SimTrader admin panel.")
    print(f"{'='*55}\n")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_price(s: str) -> float:
    """Parse a price string, handling Bloomberg's formatting quirks."""
    s = s.strip().replace(",", "").replace(" ", "")
    if not s or s == "-":
        raise ValueError(f"Empty price: {s!r}")
    return float(s)


def _parse_volume(s: str) -> int:
    """Parse volume, removing commas (Bloomberg formats as 1,234,567)."""
    s = s.strip().replace(",", "").replace(" ", "")
    if not s or s == "-":
        return 0
    return int(float(s))  # float() first handles scientific notation


def _valid_ohlc(o: float, h: float, l: float, c: float) -> bool:
    """Validate that OHLC values are internally consistent."""
    if h < l:
        return False
    if h < max(o, c) - 0.0001:   # tiny tolerance for floating point
        return False
    if l > min(o, c) + 0.0001:
        return False
    return True


def _pkt_to_datetime(trade_date: date, time_pkt: str) -> datetime:
    """
    Convert a PKT time string (HH:MM) on a given date to a UTC datetime object.
    PKT = UTC+5, so we subtract 5 hours.
    """
    from datetime import timedelta
    h, m = map(int, time_pkt.split(":"))
    dt_pkt = datetime(trade_date.year, trade_date.month, trade_date.day, h, m, 0)
    return dt_pkt - timedelta(hours=PKT_OFFSET_HOURS)


def _pkt_to_utc(trade_date: date, time_pkt: str) -> str:
    """
    Convert a PKT time string (HH:MM) on a given date to a UTC ISO 8601 string.
    PKT = UTC+5, so we subtract 5 hours.
    Example: 2026-04-01 09:30 PKT → 2026-04-01T04:30:00Z
    """
    dt_utc = _pkt_to_datetime(trade_date, time_pkt)
    return dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def _in_session(time_pkt: str) -> bool:
    """Check if a PKT time string falls within PSX trading hours."""
    def to_mins(t: str) -> int:
        h, m = map(int, t.split(":"))
        return h * 60 + m

    bar  = to_mins(time_pkt)
    start = to_mins(SESSION_START_PKT)
    end   = to_mins(SESSION_END_PKT)
    return start <= bar < end


if __name__ == "__main__":
    main()
