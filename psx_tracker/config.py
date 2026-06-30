import os
import sys
from datetime import date

# SimTrader integration — push EOD prices after each successful fetch
SIMTRADER_URL = os.getenv("SIMTRADER_URL", "http://localhost:8080")

# INTERNAL_SECRET gates the backend endpoint that ingests EOD prices and moves
# student cash/positions. There is NO default (SECRET-01) — shipping a guessable
# 'dev-internal-secret' would undermine the constant-time check on the Go side.
# Exit at import if it is unset so misconfiguration is loud, not silent.
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "")
if not INTERNAL_SECRET:
    print(
        "[config] FATAL: INTERNAL_SECRET is not set. Refusing to start — it must "
        "match the backend's INTERNAL_SECRET (generate with: openssl rand -hex 32).",
        file=sys.stderr,
    )
    sys.exit(1)

# Timezone for all scheduling/date logic. PSX trades in Pakistan Standard Time;
# pinning it explicitly means the EOD job fires at the right wall-clock time
# even on a UTC cloud host (AVAIL-04).
TIMEZONE = "Asia/Karachi"

# Database path — override with PSX_DB_PATH env var for Docker deployments
DB_PATH = os.getenv("PSX_DB_PATH", os.path.join(os.path.dirname(__file__), "psx_data.db"))

# The earliest date we care about (set to today on first run)
START_DATE = date(2026, 4, 29)

# PSX closes at 15:30 PKT (UTC+5), so 10:30 UTC
# Schedule daily fetch at 16:00 PKT to be safe
EOD_FETCH_TIME = "16:00"  # 24h, PKT (local machine must be set to PKT or adjust accordingly)

# How many tickers to fetch in one batch (avoid hammering the server)
BATCH_SIZE = 50

# Seconds to wait between batches
BATCH_DELAY = 2

# Same-day retry policy for a failed/empty EOD fetch (AVAIL-04).
EOD_RETRY_ATTEMPTS = 2
EOD_RETRY_DELAY_MIN = 20

# Upper bound on automatic catch-up backfill after an outage (AVAIL-04). A gap
# larger than this is backfilled only for the most recent window and alerted,
# rather than silently grinding through months of history on startup.
MAX_BACKFILL_DAYS = 90

# PSX public holidays — active-flag sync is skipped on these days so that a
# closed market does not incorrectly mark listed stocks as inactive.
# Add dates here whenever PSX announces a holiday (Eid, national days, etc.).
PSX_HOLIDAYS: set[date] = {
    date(2026, 3, 23),   # Pakistan Day
    date(2026, 5,  1),   # Labour Day
}
