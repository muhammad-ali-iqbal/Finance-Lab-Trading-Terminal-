#!/usr/bin/env python3
"""
validate_simtrader_csv.py
=========================
Run this AFTER bloomberg_to_simtrader.py and BEFORE uploading to SimTrader.
Catches every data quality issue the Go ingestion service would reject.

Usage:
    python validate_simtrader_csv.py simulation_2026_04_01.csv

Exit code 0 = all good, upload it.
Exit code 1 = errors found, fix them first.
"""

import sys
import csv
from pathlib import Path
from datetime import datetime
from collections import defaultdict


def validate(filepath: str) -> bool:
    path = Path(filepath)
    if not path.exists():
        print(f"ERROR: File not found: {filepath}")
        return False

    print(f"\nValidating: {filepath}")
    print("=" * 55)

    errors   = []
    warnings = []
    rows     = []

    # ── Read CSV ──────────────────────────────────────────────────
    try:
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)

            required_cols = {"timestamp", "symbol", "open", "high", "low", "close", "volume"}
            if not required_cols.issubset(set(reader.fieldnames or [])):
                missing = required_cols - set(reader.fieldnames or [])
                errors.append(f"Missing columns: {missing}")
                _report(errors, warnings, rows=[])
                return False

            for i, row in enumerate(reader, start=2):  # line 1 = header
                rows.append((i, row))
    except Exception as e:
        errors.append(f"Could not read CSV: {e}")
        _report(errors, warnings, rows=[])
        return False

    if not rows:
        errors.append("CSV is empty (no data rows)")
        _report(errors, warnings, rows=[])
        return False

    print(f"Rows read:  {len(rows):,}")

    # ── Per-row validation ────────────────────────────────────────
    symbols_seen    = defaultdict(list)
    timestamps_seen = set()
    prev_ts         = None

    for line_num, row in rows:
        ts_str = row.get("timestamp", "").strip()
        symbol = row.get("symbol", "").strip().upper()

        # Timestamp format
        try:
            ts = datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            errors.append(f"Line {line_num}: Invalid timestamp format '{ts_str}' — must be YYYY-MM-DDTHH:MM:SSZ")
            continue

        # Ascending order
        if prev_ts and ts < prev_ts:
            errors.append(f"Line {line_num}: Timestamp out of order — {ts_str} comes after {prev_ts.isoformat()}Z")
        prev_ts = ts

        # Symbol
        if not symbol:
            errors.append(f"Line {line_num}: Empty symbol")
            continue
        if len(symbol) > 15:
            warnings.append(f"Line {line_num}: Symbol '{symbol}' is unusually long")

        symbols_seen[symbol].append(ts)

        # Numeric fields
        try:
            o = float(row["open"])
            h = float(row["high"])
            l = float(row["low"])
            c = float(row["close"])
            v = int(float(row["volume"]))
        except ValueError as e:
            errors.append(f"Line {line_num}: Non-numeric value — {e}")
            continue

        # Price validity
        for name, val in [("open", o), ("high", h), ("low", l), ("close", c)]:
            if val <= 0:
                errors.append(f"Line {line_num}: {name}={val} must be > 0")

        # OHLC logic
        if h < l:
            errors.append(f"Line {line_num}: high ({h}) < low ({l})")
        if h < max(o, c) - 0.01:
            errors.append(f"Line {line_num}: high ({h}) < max(open,close) = {max(o,c)}")
        if l > min(o, c) + 0.01:
            errors.append(f"Line {line_num}: low ({l}) > min(open,close) = {min(o,c)}")

        # Volume
        if v < 0:
            errors.append(f"Line {line_num}: negative volume ({v})")

    # ── Cross-symbol validation ───────────────────────────────────
    if len(symbols_seen) == 0:
        errors.append("No symbols found in data")
    else:
        # Check all symbols have same number of bars
        bar_counts = {sym: len(ts_list) for sym, ts_list in symbols_seen.items()}
        min_bars = min(bar_counts.values())
        max_bars = max(bar_counts.values())

        if min_bars != max_bars:
            warnings.append(
                f"Symbols have different bar counts "
                f"(min={min_bars}, max={max_bars}). "
                f"Missing bars were forward-filled — this is OK if you ran the converter."
            )
            for sym, count in sorted(bar_counts.items()):
                if count != max_bars:
                    warnings.append(f"  {sym}: {count} bars (expected {max_bars})")

        # Check PSX session coverage: 04:30 UTC to 10:29 UTC = 360 bars
        expected_bars = 360
        for sym, count in bar_counts.items():
            if count < expected_bars * 0.5:
                warnings.append(
                    f"{sym}: Only {count} bars — expected ~{expected_bars} for a full PSX day. "
                    f"Did you copy the full session?"
                )

    # ── Summary ───────────────────────────────────────────────────
    _report(errors, warnings, rows, symbols_seen, bar_counts if symbols_seen else {})

    return len(errors) == 0


def _report(errors, warnings, rows, symbols_seen=None, bar_counts=None):
    print()
    if symbols_seen:
        print(f"Symbols ({len(symbols_seen)}):  {', '.join(sorted(symbols_seen.keys()))}")
    if bar_counts:
        print(f"Bars per symbol range: {min(bar_counts.values())}-{max(bar_counts.values())}")
    print(f"Total rows: {len(rows):,}")
    print()

    if warnings:
        print(f"Warnings ({len(warnings)}):")
        for w in warnings:
            print(f"  [WARN]  {w}")
        print()

    if errors:
        print(f"Errors ({len(errors)}) — fix these before uploading:")
        for e in errors:
            print(f"  [ERR]  {e}")
        print()
        print("FAILED -- do not upload this file.")
    else:
        print("PASSED -- safe to upload to SimTrader.")

    print("=" * 55 + "\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python validate_simtrader_csv.py <path_to_csv>")
        sys.exit(1)

    ok = validate(sys.argv[1])
    sys.exit(0 if ok else 1)
