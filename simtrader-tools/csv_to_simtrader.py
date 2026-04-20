#!/usr/bin/env python3
"""
csv_to_simtrader.py
===================
Converts standard OHLCV CSV files (Yahoo Finance, PSX website exports,
broker platforms, Mettis, etc.) into the SimTrader CSV format.

MULTIPLE TICKERS: Drop one CSV per symbol into a directory. The script
reads all of them and merges them into a single SimTrader CSV. This is
how you load 20+ PSX stocks into one simulation.

SUPPORTED INPUT FORMATS
-----------------------
1. Yahoo Finance export   — Date | Open | High | Low | Close | Adj Close | Volume
2. Standard intraday CSV  — datetime/timestamp | open | high | low | close | volume
3. Date-only (daily)      — date | open | high | low | close | volume
   ↑ Daily mode requires --daily flag; generates synthetic 1-minute bars.

Column names are matched case-insensitively. Column order doesn't matter.
An optional "symbol" column is used when all tickers are in one file.

HOW TO USE
----------
A) Multiple tickers from separate CSV files (recommended):
   Put one file per ticker in a folder, named after the ticker:
     data/
       LUCK.csv
       ENGRO.csv
       HBL.csv

   Then run:
     python csv_to_simtrader.py --input-dir ./data --output simulation.csv --date 2026-04-01

B) Multiple tickers already in one CSV (with a "symbol" column):
     python csv_to_simtrader.py --input-file all_tickers.csv --output simulation.csv --date 2026-04-01

C) Daily OHLCV data (generates synthetic 1-minute bars across PSX session):
     python csv_to_simtrader.py --input-dir ./data --output simulation.csv --date 2026-04-01 --daily

D) Non-PKT timezone (e.g. data is in UTC already):
     python csv_to_simtrader.py --input-dir ./data --output simulation.csv --date 2026-04-01 --tz utc

SIMTRADER OUTPUT FORMAT
-----------------------
  timestamp,symbol,open,high,low,close,volume
  2026-04-01T04:30:00Z,LUCK,100.0,101.0,99.5,100.5,10000
  2026-04-01T04:30:00Z,ENGRO,200.0,201.0,199.5,200.5,5000
  ...

MULTI-TICKER NOTE
-----------------
The SimTrader backend fully supports multiple tickers in one CSV.
At each simulated minute, the clock broadcasts ALL symbols simultaneously.
Students can trade any symbol listed in the simulation.
"""

import os
import re
import sys
import csv
import argparse
import random
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional


# ── PSX session config ────────────────────────────────────────────────────────

PKT_OFFSET_HOURS = 5          # UTC+5
SESSION_START_PKT = "09:30"   # PSX open
SESSION_END_PKT   = "15:30"   # PSX close (exclusive end)
BARS_PER_SESSION  = 360       # 09:30 to 15:29 = 360 bars

# ── Column name aliases ───────────────────────────────────────────────────────

# Maps canonical names to possible CSV column headers (case-insensitive)
COLUMN_ALIASES = {
    "datetime": ["datetime", "timestamp", "time", "date", "date/time", "date time"],
    "open":     ["open", "open_price", "o"],
    "high":     ["high", "high_price", "h"],
    "low":      ["low", "low_price", "l"],
    "close":    ["close", "close_price", "c", "last", "last_price"],
    "volume":   ["volume", "vol", "v", "qty", "quantity"],
    "symbol":   ["symbol", "ticker", "sym", "code", "stock"],
    # Yahoo Finance specific — we skip this column
    "adj_close": ["adj close", "adj. close", "adjusted close", "adj_close"],
}


# ── CSV format detection & parsing ───────────────────────────────────────────

def detect_columns(header: list[str]) -> dict[str, int]:
    """Map canonical column names to their index in the CSV header."""
    header_lower = [h.strip().lower() for h in header]
    mapping = {}
    for canonical, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in header_lower:
                mapping[canonical] = header_lower.index(alias)
                break
    return mapping


def validate_column_mapping(mapping: dict[str, int], has_symbol_col: bool) -> None:
    """Ensure all required columns are present."""
    required = {"datetime", "open", "high", "low", "close", "volume"}
    if not has_symbol_col and "symbol" not in mapping:
        pass  # symbol comes from filename, not required in CSV
    missing = required - set(mapping.keys())
    if missing:
        raise ValueError(f"Missing required columns: {sorted(missing)}. "
                         f"Check column names — they must include datetime (or date/timestamp), "
                         f"open, high, low, close, volume.")


def parse_datetime(s: str, trade_date: date, tz_offset_hours: int) -> Optional[datetime]:
    """
    Parse a datetime string and convert to UTC.

    Handles:
    - Full datetime: "2026-04-01 09:30:00", "2026-04-01T09:30:00", "01/04/2026 09:30"
    - Time-only: "09:30", "09:30:00" (uses trade_date)
    - Date-only: "2026-04-01" (use for --daily mode, caller handles expansion)
    """
    s = s.strip()
    if not s:
        return None

    # Remove timezone suffixes (we handle timezone via offset)
    s = re.sub(r'[+-]\d{2}:\d{2}$', '', s).strip()
    s = re.sub(r'Z$', '', s).strip()

    # Normalize separators
    s_norm = s.replace('/', '-').replace('T', ' ')

    formats_with_date = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d-%m-%Y %H:%M",
        "%m-%d-%Y %H:%M:%S",
        "%m-%d-%Y %H:%M",
        "%Y-%m-%d",       # date-only
        "%d-%m-%Y",
        "%m-%d-%Y",
    ]
    formats_time_only = [
        "%H:%M:%S",
        "%H:%M",
    ]

    for fmt in formats_with_date:
        try:
            dt = datetime.strptime(s_norm, fmt)
            # For date-only strings, time will be 00:00:00
            dt_utc = dt - timedelta(hours=tz_offset_hours)
            return dt_utc
        except ValueError:
            continue

    # Try time-only — combine with trade_date
    for fmt in formats_time_only:
        try:
            t = datetime.strptime(s, fmt)
            dt = datetime(trade_date.year, trade_date.month, trade_date.day,
                          t.hour, t.minute, t.second)
            dt_utc = dt - timedelta(hours=tz_offset_hours)
            return dt_utc
        except ValueError:
            continue

    return None


def _in_session(dt_pkt: datetime) -> bool:
    """Return True if a PKT datetime falls within PSX trading hours."""
    def to_mins(h, m): return h * 60 + m
    start = to_mins(*[int(x) for x in SESSION_START_PKT.split(":")])
    end   = to_mins(*[int(x) for x in SESSION_END_PKT.split(":")])
    bar   = to_mins(dt_pkt.hour, dt_pkt.minute)
    return start <= bar < end


def parse_intraday_file(
    path: Path,
    symbol: str,
    trade_date: date,
    tz_offset_hours: int,
    filter_session: bool = True,
    force_symbol: bool = False,
) -> list[dict]:
    """
    Parse a standard intraday OHLCV CSV file.
    Returns list of SimTrader-format row dicts.

    force_symbol: if True, always use the `symbol` parameter (filename-derived),
                  ignoring any symbol column in the CSV.
    """
    text = path.read_text(encoding="utf-8", errors="replace")

    # Handle Excel-style BOM
    if text.startswith("\ufeff"):
        text = text[1:]

    reader = csv.reader(text.splitlines())
    header = next(reader, None)
    if header is None:
        raise ValueError(f"{path.name}: empty file")

    col = detect_columns(header)
    has_symbol_col = "symbol" in col and not force_symbol
    validate_column_mapping(col, has_symbol_col)

    rows = []
    for line_num, record in enumerate(reader, start=2):
        if not any(r.strip() for r in record):
            continue  # skip blank lines

        raw_sym = record[col["symbol"]].strip().upper() if has_symbol_col else symbol.upper()
        if not raw_sym:
            raw_sym = symbol.upper()

        raw_dt = record[col["datetime"]].strip()
        dt_utc = parse_datetime(raw_dt, trade_date, tz_offset_hours)
        if dt_utc is None:
            print(f"  [WARN] Line {line_num}: could not parse datetime {raw_dt!r} — skipping")
            continue

        # Filter to the target date (in UTC)
        # Convert back to local to do date comparison
        dt_local = dt_utc + timedelta(hours=tz_offset_hours)
        if dt_local.date() != trade_date:
            continue

        # Filter to PSX session if requested
        if filter_session and tz_offset_hours == PKT_OFFSET_HOURS:
            if not _in_session(dt_local):
                continue

        try:
            open_  = float(str(record[col["open"]]).replace(",", ""))
            high   = float(str(record[col["high"]]).replace(",", ""))
            low    = float(str(record[col["low"]]).replace(",", ""))
            close  = float(str(record[col["close"]]).replace(",", ""))
            volume_str = str(record[col["volume"]]).replace(",", "").strip()
            volume = int(float(volume_str)) if volume_str and volume_str != "-" else 0
        except (ValueError, IndexError) as e:
            print(f"  [WARN] Line {line_num}: parse error ({e}) — skipping")
            continue

        if open_ <= 0 or high <= 0 or low <= 0 or close <= 0:
            print(f"  [WARN] Line {line_num}: non-positive price — skipping")
            continue

        if high < low:
            print(f"  [WARN] Line {line_num}: high < low — skipping")
            continue

        # Clamp high/low to be consistent
        high  = max(high, open_, close)
        low   = min(low, open_, close)

        rows.append({
            "timestamp": dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "symbol":    raw_sym,
            "open":      round(open_, 4),
            "high":      round(high,  4),
            "low":       round(low,   4),
            "close":     round(close, 4),
            "volume":    volume,
        })

    return rows


# ── Daily → synthetic 1-minute expansion ─────────────────────────────────────

def expand_daily_to_minutes(
    daily_row: dict,
    trade_date: date,
    seed: Optional[int] = None,
) -> list[dict]:
    """
    Generate synthetic 1-minute OHLCV bars from a single daily OHLCV row.

    Method: Geometric Brownian-style random walk constrained to the day's H/L range.
    - Starts at open, ends at close.
    - Stays within [low, high] bounds.
    - Volume distributed uniformly with slight U-shape (more at open/close).
    - Deterministic when seed is provided (same seed → same bars for a given ticker+date).

    This is an approximation. For real simulations, use actual intraday data.
    """
    rng = random.Random(seed)

    symbol    = daily_row["symbol"]
    open_px   = daily_row["open"]
    high_px   = daily_row["high"]
    low_px    = daily_row["low"]
    close_px  = daily_row["close"]
    total_vol = daily_row["volume"]

    # Generate BARS_PER_SESSION price points via clamped random walk
    n = BARS_PER_SESSION
    prices = [open_px]
    step_std = (high_px - low_px) / (n ** 0.5) * 0.5 or 0.001

    for i in range(1, n):
        # Drift toward close as we approach end of session
        progress = i / (n - 1)
        drift = (close_px - prices[-1]) * progress * 0.15
        noise = rng.gauss(0, step_std)
        new_p = prices[-1] + drift + noise
        new_p = max(low_px, min(high_px, new_p))
        prices.append(new_p)

    # Force last price to close
    prices[-1] = close_px

    # Generate per-bar OHLCV — each bar is a 1-minute slice
    session_start = _pkt_to_utc_dt(trade_date, SESSION_START_PKT)
    bars = []

    for i in range(n):
        ts = session_start + timedelta(minutes=i)

        p = prices[i]
        next_p = prices[i + 1] if i + 1 < n else p

        bar_open  = p
        bar_close = next_p
        bar_high  = max(bar_open, bar_close) * (1 + rng.uniform(0, 0.001))
        bar_low   = min(bar_open, bar_close) * (1 - rng.uniform(0, 0.001))
        bar_high  = min(bar_high, high_px)
        bar_low   = max(bar_low, low_px)

        # U-shaped volume: more at open (first 30 bars) and close (last 30 bars)
        if i < 30 or i >= n - 30:
            vol_weight = rng.uniform(1.5, 2.5)
        else:
            vol_weight = rng.uniform(0.5, 1.5)

        bars.append({"weight": vol_weight, "ts": ts,
                     "open": bar_open, "high": bar_high, "low": bar_low, "close": bar_close})

    # Distribute volume proportional to weight
    total_weight = sum(b["weight"] for b in bars)
    result = []
    for b in bars:
        bar_vol = int(total_vol * b["weight"] / total_weight)
        result.append({
            "timestamp": b["ts"].strftime("%Y-%m-%dT%H:%M:%SZ"),
            "symbol":    symbol,
            "open":      round(b["open"],  4),
            "high":      round(b["high"],  4),
            "low":       round(b["low"],   4),
            "close":     round(b["close"], 4),
            "volume":    bar_vol,
        })

    return result


def _pkt_to_utc_dt(trade_date: date, time_pkt: str) -> datetime:
    h, m = map(int, time_pkt.split(":"))
    dt_pkt = datetime(trade_date.year, trade_date.month, trade_date.day, h, m, 0)
    return dt_pkt - timedelta(hours=PKT_OFFSET_HOURS)


def parse_daily_file(path: Path, symbol: str, trade_date: date, tz_offset_hours: int) -> list[dict]:
    """Parse a daily OHLCV file and return one dict per day (to be expanded later)."""
    text = path.read_text(encoding="utf-8", errors="replace")
    if text.startswith("\ufeff"):
        text = text[1:]

    reader = csv.reader(text.splitlines())
    header = next(reader, None)
    if header is None:
        raise ValueError(f"{path.name}: empty file")

    col = detect_columns(header)
    has_symbol_col = "symbol" in col
    validate_column_mapping(col, has_symbol_col)

    rows = []
    for line_num, record in enumerate(reader, start=2):
        if not any(r.strip() for r in record):
            continue

        raw_sym = record[col["symbol"]].strip().upper() if has_symbol_col else symbol.upper()
        raw_dt = record[col["datetime"]].strip()

        # For daily, parse as date only
        parsed_date = None
        for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d"]:
            try:
                parsed_date = datetime.strptime(raw_dt.split()[0].replace("/", "-"), "%Y-%m-%d").date()
                break
            except ValueError:
                try:
                    parsed_date = datetime.strptime(raw_dt.split()[0], fmt).date()
                    break
                except ValueError:
                    continue

        if parsed_date is None:
            print(f"  [WARN] Line {line_num}: could not parse date {raw_dt!r} — skipping")
            continue

        if parsed_date != trade_date:
            continue

        try:
            open_  = float(str(record[col["open"]]).replace(",", ""))
            high   = float(str(record[col["high"]]).replace(",", ""))
            low    = float(str(record[col["low"]]).replace(",", ""))
            close  = float(str(record[col["close"]]).replace(",", ""))
            vol_s  = str(record[col["volume"]]).replace(",", "").strip()
            volume = int(float(vol_s)) if vol_s and vol_s != "-" else 0
        except (ValueError, IndexError) as e:
            print(f"  [WARN] Line {line_num}: parse error ({e}) — skipping")
            continue

        rows.append({
            "symbol": raw_sym,
            "open":   open_,
            "high":   high,
            "low":    low,
            "close":  close,
            "volume": volume,
        })

    return rows


# ── Forward-fill missing bars ─────────────────────────────────────────────────

def forward_fill_gaps(rows: list[dict], symbol: str, trade_date: date) -> list[dict]:
    """Fill missing 1-minute bars across the full PSX session."""
    if not rows:
        return rows

    existing  = {r["timestamp"]: r for r in rows}
    start_utc = _pkt_to_utc_dt(trade_date, SESSION_START_PKT)
    end_utc   = _pkt_to_utc_dt(trade_date, SESSION_END_PKT)

    all_bars = []
    last_close = rows[0]["open"]
    ts = start_utc
    while ts < end_utc:
        ts_str = ts.strftime("%Y-%m-%dT%H:%M:%SZ")
        if ts_str in existing:
            bar = existing[ts_str]
            last_close = bar["close"]
            all_bars.append(bar)
        else:
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
        print(f"  [INFO] {symbol}: forward-filled {filled} missing bar(s)")

    return all_bars


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convert standard OHLCV CSV files to SimTrader multi-ticker format",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--input-dir", "-i",
        help="Directory with one CSV per symbol (LUCK.csv, ENGRO.csv, ...)"
    )
    group.add_argument(
        "--input-file", "-f",
        help="Single CSV file with a 'symbol' column (all tickers in one file)"
    )
    parser.add_argument(
        "--output", "-o",
        required=True,
        help="Output CSV path (e.g. simulation_2026_04_01.csv)"
    )
    parser.add_argument(
        "--date", "-d",
        required=True,
        help="Trading date to extract: YYYY-MM-DD"
    )
    parser.add_argument(
        "--tz",
        default="pkt",
        choices=["pkt", "utc", "est", "gmt"],
        help="Timezone of the source data. Default: pkt (UTC+5, Pakistan Standard Time)"
    )
    parser.add_argument(
        "--daily",
        action="store_true",
        help="Input data is daily OHLCV (not intraday). Generates synthetic 1-minute bars."
    )
    parser.add_argument(
        "--no-fill",
        action="store_true",
        help="Skip forward-filling of missing bars within the PSX session"
    )
    parser.add_argument(
        "--no-session-filter",
        action="store_true",
        help="Include all hours, not just PSX session (09:30–15:29 PKT)"
    )
    args = parser.parse_args()

    # Timezone offset
    tz_offsets = {"pkt": 5, "utc": 0, "est": -5, "gmt": 0}
    tz_offset = tz_offsets[args.tz]

    # Parse date
    try:
        trade_date = date.fromisoformat(args.date)
    except ValueError:
        print(f"ERROR: Invalid date '{args.date}'. Use YYYY-MM-DD.")
        sys.exit(1)

    print(f"\nSimTrader CSV Converter")
    print(f"Date: {trade_date}  |  TZ: {args.tz.upper()} (UTC{tz_offset:+d})  |  "
          f"Mode: {'daily→1min' if args.daily else 'intraday'}  |  Output: {args.output}")

    all_rows = []
    errors = []

    # ── A: Directory of per-ticker files ──────────────────────────────────────
    if args.input_dir:
        input_dir = Path(args.input_dir)
        if not input_dir.exists():
            print(f"ERROR: Directory '{input_dir}' not found.")
            sys.exit(1)

        # Skip files that look like SimTrader outputs
        SKIP_PATTERNS = {"simulation", "output", "test_"}
        seen_stems: set[str] = set()
        csv_files_raw = sorted(input_dir.glob("*.[cC][sS][vV]"))
        csv_files = []
        for f in csv_files_raw:
            key = f.stem.upper()
            if key in seen_stems:
                continue
            seen_stems.add(key)
            if any(pat in f.stem.lower() for pat in SKIP_PATTERNS):
                continue
            csv_files.append(f)
        csv_files.sort(key=lambda f: f.stem.upper())
        if not csv_files:
            print(f"ERROR: No .csv files in '{input_dir}'.")
            sys.exit(1)

        print(f"Found {len(csv_files)} CSV file(s)\n")

        for csv_file in csv_files:
            symbol = csv_file.stem.upper()
            print(f"Processing {symbol} ({csv_file.name})...")

            try:
                if args.daily:
                    daily_rows = parse_daily_file(csv_file, symbol, trade_date, tz_offset)
                    if not daily_rows:
                        print(f"  [ERROR] No data for {trade_date} in {csv_file.name}")
                        errors.append(symbol)
                        continue
                    rows = []
                    for dr in daily_rows:
                        seed = hash((dr["symbol"], str(trade_date))) & 0xFFFFFFFF
                        rows.extend(expand_daily_to_minutes(dr, trade_date, seed=seed))
                    print(f"  Generated {len(rows)} synthetic 1-minute bars from {len(daily_rows)} daily row(s)")
                else:
                    rows = parse_intraday_file(
                        csv_file, symbol, trade_date, tz_offset,
                        filter_session=not args.no_session_filter,
                        force_symbol=True,  # filename is the canonical symbol name
                    )
                    if not rows:
                        print(f"  [ERROR] No intraday bars for {trade_date} in {csv_file.name}")
                        print(f"          Check: date format, --date value, timezone (--tz), column names")
                        errors.append(symbol)
                        continue
                    print(f"  Parsed {len(rows)} bars")

                    if not args.no_fill and not args.no_session_filter:
                        rows = forward_fill_gaps(rows, symbol, trade_date)

                all_rows.extend(rows)
                print(f"  OK {symbol}: {len(rows)} bars ready")

            except ValueError as e:
                print(f"  [ERROR] {e}")
                errors.append(symbol)

    # ── B: Single file with symbol column ─────────────────────────────────────
    else:
        input_file = Path(args.input_file)
        if not input_file.exists():
            print(f"ERROR: File '{input_file}' not found.")
            sys.exit(1)

        print(f"Reading {input_file.name}...\n")

        try:
            if args.daily:
                daily_rows = parse_daily_file(input_file, "UNKNOWN", trade_date, tz_offset)
                if not daily_rows:
                    print(f"ERROR: No data for {trade_date} in {input_file.name}")
                    sys.exit(1)
                # Group by symbol
                by_symbol: dict[str, list] = {}
                for dr in daily_rows:
                    by_symbol.setdefault(dr["symbol"], []).append(dr)
                for sym, sym_rows in sorted(by_symbol.items()):
                    print(f"Processing {sym}...")
                    rows = []
                    for dr in sym_rows:
                        seed = hash((sym, str(trade_date))) & 0xFFFFFFFF
                        rows.extend(expand_daily_to_minutes(dr, trade_date, seed=seed))
                    all_rows.extend(rows)
                    print(f"  OK {sym}: {len(rows)} synthetic bars")
            else:
                rows = parse_intraday_file(
                    input_file, "UNKNOWN", trade_date, tz_offset,
                    filter_session=not args.no_session_filter,
                )
                if not rows:
                    print(f"ERROR: No bars for {trade_date}. "
                          f"Check --date, --tz, and column names.")
                    sys.exit(1)
                # Group by symbol for fill
                by_symbol: dict[str, list] = {}
                for r in rows:
                    by_symbol.setdefault(r["symbol"], []).append(r)
                for sym, sym_rows in sorted(by_symbol.items()):
                    print(f"Processing {sym}...")
                    if not args.no_fill and not args.no_session_filter:
                        sym_rows = forward_fill_gaps(sym_rows, sym, trade_date)
                    all_rows.extend(sym_rows)
                    print(f"  OK {sym}: {len(sym_rows)} bars ready")

        except ValueError as e:
            print(f"ERROR: {e}")
            sys.exit(1)

    if not all_rows:
        print("\nERROR: No data to write.")
        sys.exit(1)

    # Sort: timestamp first, then symbol (matches SimTrader's expected ordering)
    all_rows.sort(key=lambda r: (r["timestamp"], r["symbol"]))

    # Write output
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
    print(f"\n{'=' * 60}")
    print(f"Output: {output_path}")
    print(f"  Symbols ({len(symbols_done)}): {', '.join(symbols_done)}")
    print(f"  Total rows:       {len(all_rows):,}")
    print(f"  Date:             {trade_date}")
    if errors:
        print(f"\n  Failed ({len(errors)}): {', '.join(errors)}")
    else:
        print(f"\n  All symbols processed successfully.")
    print(f"\nNext step: Upload '{output_path}' via the SimTrader admin panel.")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    main()
