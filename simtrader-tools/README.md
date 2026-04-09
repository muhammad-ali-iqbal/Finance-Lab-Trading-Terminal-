# SimTrader Data Preparation Guide
## Bloomberg PSX → SimTrader CSV

---

## What you need installed
- Python 3.10+ (no extra libraries needed — all standard library)
- Bloomberg Terminal access with PSX data subscription

---

## Step 1 — Choose your PSX symbols

Pick 20–25 stocks from KSE. Recommended spread for teaching:

| Category | Examples | Why |
|---|---|---|
| Large cap / liquid | LUCK, ENGRO, HBL, UBL, MCB | Tight spreads, good for market orders |
| Mid cap | OGDC, PPL, PSO, HUBC | Moderate volatility |
| Volatile / high beta | SYS, TRG, AVN | Good for limit/stop order lessons |
| Defensive | NESTLE, COLG, SRVI | Low volatility, teaches position sizing |

---

## Step 2 — Pull data from Bloomberg for each symbol

**On the Bloomberg Terminal:**

1. Type the ticker: `LUCK PA Equity` → press **Enter**
2. Type `IOHLC` → press **Enter** — opens Intraday OHLC Table
3. Set **Period** = `1` (1-minute bars)
4. Set **Range** = your chosen date (e.g. `04/01/26` to `04/01/26`)
5. Wait for data to load — you should see rows like:
   ```
   09:30 - 09:31   254.19   +.40   254.08   256.18   254.00   1527   776,409
   09:31 - 09:32   253.95   -.24   254.08   254.46   253.82   467    88,799
   ```
6. Click anywhere in the table → **Ctrl+A** to select all rows
7. **Ctrl+C** to copy
8. Open Notepad (or any text editor)
9. **Ctrl+V** to paste
10. Save as `LUCK.txt` in a folder called `raw/`

**Repeat for every symbol.**

Your `raw/` folder should look like:
```
raw/
  LUCK.txt
  ENGRO.txt
  HBL.txt
  UBL.txt
  MCB.txt
  OGDC.txt
  PPL.txt
  PSO.txt
  HUBC.txt
  SYS.txt
  TRG.txt
  ... (all 20-25 symbols)
```

---

## Step 3 — Run the converter

```bash
python bloomberg_to_simtrader.py \
  --input-dir ./raw \
  --output simulation_2026_04_01.csv \
  --date 2026-04-01
```

**Expected output:**
```
SimTrader Bloomberg Converter
Date: 2026-04-01  |  Input: raw  |  Output: simulation_2026_04_01.csv
Found 20 symbol file(s)

Processing LUCK...
  Parsed 357 bars
  [INFO] LUCK: forward-filled 3 missing bars
  ✓ LUCK: 360 bars ready

Processing ENGRO...
  Parsed 360 bars
  ✓ ENGRO: 360 bars ready
...
=======================================================
✓ Output written to: simulation_2026_04_01.csv
  Symbols:    20 (AVN, COLG, ENGRO, HBL, HUBC, LUCK, ...)
  Total rows: 7,200
  Date:       2026-04-01
✓ All symbols processed successfully.
=======================================================
```

---

## Step 4 — Validate before uploading

```bash
python validate_simtrader_csv.py simulation_2026_04_01.csv
```

**Expected output:**
```
Validating: simulation_2026_04_01.csv
=======================================================
Rows read:  7,200

Symbols (20):  AVN, COLG, ENGRO, HBL, HUBC, LUCK, ...
Bars per symbol range: 360–360
Total rows: 7,200

✓ Validation PASSED — safe to upload to SimTrader.
=======================================================
```

If you see any errors, fix them before uploading.

---

## Step 5 — Upload to SimTrader

Log in as admin → Simulation Management → New Simulation → Upload CSV.

---

## Choosing a good simulation date

Pick a date with market interest — makes for better teaching moments:

| Date type | Effect on simulation |
|---|---|
| Normal day | Clean, predictable — good for intro sessions |
| Earnings announcement day | One stock moves sharply — teaches event-driven trading |
| Market-wide selloff | All stocks fall — teaches portfolio risk |
| High volatility day (KSE-100 swings >1%) | Good for stop-loss lessons |
| Low volatility day | Good for limit order patience lessons |

You can prepare multiple simulation files for different teaching scenarios and switch between them in the admin panel.

---

## PSX session times

| | PKT (local) | UTC (stored in DB) |
|---|---|---|
| Market open | 09:30 | 04:30 |
| Market close | 15:30 | 10:30 |
| Total bars | 360 per symbol | 360 per symbol |

---

## Troubleshooting

**"No valid bars found for SYMBOL"**
→ The Bloomberg paste format may differ. Open the .txt file and check:
- Does it have the `HH:MM - HH:MM` time range pattern?
- Are the columns in the right order?
- Is there extra header text that wasn't filtered?

**"Timestamp out of order"**
→ You may have pasted Bloomberg data in reverse order (newest first).
The Intraday OHLC Table sometimes sorts descending by default.
In Bloomberg, look for a sort button and set to Ascending before copying.

**"high < max(open, close)"**
→ Bloomberg occasionally exports a bad tick.
The converter skips these automatically and logs a warning.
If many rows are skipped, the raw data may have quality issues.

**Volume is 0 for many bars**
→ Normal for less liquid PSX stocks in off-peak minutes.
The forward-fill step creates bars with volume=0 for missing periods.
Students see these as flat candles — no price movement.
