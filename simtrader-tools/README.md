# SimTrader Data Preparation

Convert PSX intraday data into SimTrader CSV format, validate it, and upload it to a simulation.

---

## Requirements

- Python 3.10+ (standard library only — no pip installs needed)
- PSX intraday data exported as tab-separated `.txt` files (one file per symbol)

---

## Scripts

| Script | Purpose |
|--------|---------|
| `psx_to_simtrader.py` | Convert PSX export files to SimTrader CSV |
| `validate_simtrader_csv.py` | Validate the output before uploading |

---

## Workflow

### Step 1 — Export data from your PSX data provider

Export 1-minute intraday data for each symbol. The expected format is tab-separated:

```
Exchange Date   Exchange Time   Local Date   Local Time   Close   Net   %Chg   Open   Low   High   Volume   Trade Price
06-Apr-2026     09:30           06-Apr-2026  09:30        338.50  ...
```

Notes:
- One `.txt` file per symbol, named after the symbol: `PSO.PK.txt`, `LUCK.PK.txt`, etc.
- The exchange suffix (`.PK`, `.KAR`) is stripped automatically — `PSO.PK.txt` → symbol `PSO`
- Rows can be in any order (newest-first is fine)
- Multiple dates per file are fine — use `--date` to select the one you want

Place all files in `raw/`:
```
simtrader-tools/
└── raw/
    ├── PSO.PK.txt
    ├── LUCK.PK.txt
    ├── ENGRO.PK.txt
    └── HBL.PK.txt
```

---

### Step 2 — Convert

**Whole directory (recommended):**
```bash
python psx_to_simtrader.py -i ./raw -o simulation.csv -d 2026-04-03
```

**Single file:**
```bash
python psx_to_simtrader.py -f raw/PSO.PK.txt -o simulation.csv -d 2026-04-03
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
|------|-------------|
| `-f / --input-file` | Single `.txt` file |
| `-i / --input-dir` | Directory of `.txt` files |
| `-o / --output` | Output CSV path |
| `-d / --date` | Trading date to extract (`YYYY-MM-DD`) |
| `--no-fill` | Skip forward-fill of missing bars |

---

### Step 3 — Validate

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

Fix any reported errors before uploading.

---

### Step 4 — Upload

1. Log in as **admin**
2. Go to **Admin → Simulations**
3. Create a new simulation (or select a draft)
4. Click **Upload CSV** and select your file
5. Click **Start** to begin the simulation

---

## Output Format

The SimTrader CSV format the backend expects:

```
timestamp,symbol,open,high,low,close,volume
2026-04-03T04:30:00Z,PSO,338.99,340.00,338.50,339.88,33284
2026-04-03T04:30:00Z,LUCK,100.50,101.20,100.10,100.80,12000
```

- Timestamps are **UTC** (PSX session 09:30–15:29 PKT = 04:30–10:29 UTC)
- All symbols share the same 360 timestamps per session day
- Rows sorted by timestamp, then symbol

---

## PSX Session Reference

| | PKT (local) | UTC (stored in DB) |
|--|-------------|-------------------|
| Market open | 09:30 | 04:30 |
| Market close | 15:29 | 10:29 |
| Bars per symbol | 360 | 360 |

---

## Recommended Symbols

| Category | Examples | Teaching Purpose |
|----------|---------|-----------------|
| Large cap | LUCK, ENGRO, HBL, UBL, MCB | Tight spreads, market order lessons |
| Mid cap | OGDC, PPL, PSO, HUBC | Moderate volatility |
| Volatile | SYS, TRG, AVN | High beta for stop-loss lessons |
| Defensive | NESTLE, COLG, SRVI | Low volatility, position sizing |

Aim for 8–20 symbols per simulation. Too few limits diversification exercises; too many is overwhelming for students in a one-session demo.

---

## Choosing a Simulation Date

| Date type | Market behavior | Teaching value |
|-----------|----------------|----------------|
| Normal day | Clean, predictable | Intro sessions |
| Earnings announcement | One stock moves sharply | Event-driven trading |
| Market-wide selloff | All stocks fall | Portfolio risk management |
| High volatility (KSE-100 >1% swing) | Sharp moves | Stop-loss and limit orders |
| Low volatility | Flat price action | Limit order patience |

Prepare several CSV files for different scenarios and switch between them in the admin panel.

---

## Troubleshooting

**"No data for YYYY-MM-DD — check --date or file contents"**
The date passed to `--date` has no rows in that file. Verify the date exists and matches the `DD-Mon-YYYY` format in the source file (e.g. `03-Apr-2026`).

**"Forward-filled N missing bar(s)"**
Normal for less liquid stocks. Missing minutes are filled by carrying the previous close forward as a flat bar with volume=0. Students see these as flat candles — expected behaviour.

**Bars per symbol range shows a mismatch in validation**
One symbol has fewer bars. This is fine if forward-fill is enabled (default). If the count is much lower than 360, the source file may have incomplete data for that date.

**"high < max(open, close)" errors in validation**
Inconsistent OHLC values in the source. The converter clamps automatically (`high = max(high, open, close)`). If this still appears in converter output, the source file is likely corrupted.
