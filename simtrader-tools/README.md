# SimTrader Data Preparation Guide

Convert PSX intraday data into SimTrader CSV format, validate it, and upload it to a simulation.

---

## Requirements

- Python 3.10+ (no third-party libraries needed)
- PSX intraday data exported as tab-separated `.txt` files (one file per symbol)

---

## Scripts

| Script | Purpose |
|---|---|
| `psx_to_simtrader.py` | Convert PSX export files to SimTrader CSV |
| `validate_simtrader_csv.py` | Validate the output before uploading |

---

## Step 1 — Export data from PSX / your data provider

Export 1-minute intraday data for each symbol. The expected file format is tab-separated with this header:

```
Exchange Date   Exchange Time   Local Date   Local Time   Close   Net   %Chg   Open   Low   High   Volume   Trade Price
06-Apr-2026     09:30           06-Apr-2026  09:30        338.50  ...
```

- One file per symbol, named after the symbol: `PSO.PK.txt`, `LUCK.PK.txt`, etc.
- The exchange suffix (`.PK`, `.KAR`) is stripped automatically — `PSO.PK.txt` becomes symbol `PSO`.
- Rows can be in any order (newest-first is fine).
- Multiple dates in one file are supported — the `--date` flag filters to the one you want.

Place all files in a folder:

```
raw/
  PSO.PK.txt
  LUCK.PK.txt
  ENGRO.PK.txt
  HBL.PK.txt
  ...
```

---

## Step 2 — Run the converter

**Single symbol:**
```bash
python psx_to_simtrader.py -f raw/PSO.PK.txt -o simulation.csv -d 2026-04-03
```

**Whole directory (recommended for multi-symbol simulations):**
```bash
python psx_to_simtrader.py -i ./raw -o simulation.csv -d 2026-04-03
```

**Expected output:**
```
PSX to SimTrader  |  2026-04-03  |  3 file(s)  ->  simulation.csv

PSO  (PSO.PK.txt)
  Parsed 207 bars
  Forward-filled 153 missing bar(s)  (360/360 total)
  OK

LUCK  (LUCK.PK.txt)
  Parsed 360 bars
  OK

ENGRO  (ENGRO.PK.txt)
  Parsed 312 bars
  Forward-filled 48 missing bar(s)  (360/360 total)
  OK

==================================================
Output  : simulation.csv
Symbols : 3  (ENGRO, LUCK, PSO)
Rows    : 1,080
==================================================
Next: validate then upload via the SimTrader admin panel.
```

**Flags:**

| Flag | Description |
|---|---|
| `-f / --input-file` | Single `.txt` file |
| `-i / --input-dir` | Directory of `.txt` files (one per symbol) |
| `-o / --output` | Output CSV path |
| `-d / --date` | Trading date to extract (`YYYY-MM-DD`) |
| `--no-fill` | Skip forward-fill of missing bars |

---

## Step 3 — Validate before uploading

```bash
python validate_simtrader_csv.py simulation.csv
```

**Expected output (passing):**
```
Validating: simulation.csv
=======================================================
Rows read:  1,080

Symbols (3):  ENGRO, LUCK, PSO
Bars per symbol range: 360-360
Total rows: 1,080

PASSED -- safe to upload to SimTrader.
=======================================================
```

**If validation fails**, fix the reported errors before uploading. Common issues are listed in the Troubleshooting section below.

---

## Step 4 — Upload to SimTrader

1. Log in as **admin**
2. Go to **Simulation Management**
3. Create a new simulation or select an existing draft
4. Click **Upload CSV** and select your file

---

## Output format reference

The SimTrader CSV format expected by the backend:

```
timestamp,symbol,open,high,low,close,volume
2026-04-03T04:30:00Z,PSO,338.99,340.00,338.50,339.88,33284
2026-04-03T04:30:00Z,LUCK,100.50,101.20,100.10,100.80,12000
```

- Timestamps are UTC (PSX session 09:30-15:29 PKT = 04:30-10:29 UTC)
- All symbols share the same set of timestamps (360 bars per symbol per day)
- Rows sorted by timestamp, then symbol

---

## PSX session reference

| | PKT (local) | UTC (stored in DB) |
|---|---|---|
| Market open | 09:30 | 04:30 |
| Market close | 15:29 | 10:29 |
| Total bars | 360 per symbol | 360 per symbol |

---

## Choosing a good simulation date

| Date type | Teaching value |
|---|---|
| Normal day | Clean, predictable -- good for intro sessions |
| Earnings announcement day | One stock moves sharply -- teaches event-driven trading |
| Market-wide selloff | All stocks fall -- teaches portfolio risk |
| High volatility day (KSE-100 swings >1%) | Good for stop-loss lessons |
| Low volatility day | Good for limit order patience lessons |

Prepare multiple CSV files for different scenarios and switch between them in the admin panel.

---

## Troubleshooting

**"No data for YYYY-MM-DD -- check --date or file contents"**
The date you passed to `--date` has no rows in that file. Verify the date exists in the export and matches the `DD-Mon-YYYY` format in the file (e.g. `03-Apr-2026`).

**"Forward-filled N missing bar(s)"**
Normal for less liquid stocks. Missing minutes within the session are filled by carrying the previous close forward as a flat bar with volume=0. Students see these as flat candles.

**Bars per symbol range shows a mismatch in validation**
One symbol has fewer bars than others. This is usually fine if you ran the converter with forward-fill enabled (the default). If the count is much lower than 360, the source file may have incomplete data for that date.

**"high < max(open, close)" errors in validation**
The source data has inconsistent OHLC values. The converter clamps high/low automatically (`high = max(high, open, close)`), so this should not appear in converter output. If it does, the source file may be corrupted.
