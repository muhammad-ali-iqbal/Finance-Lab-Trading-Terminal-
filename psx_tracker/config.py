import os
from datetime import date

# Database path — sits next to this file
DB_PATH = os.path.join(os.path.dirname(__file__), "psx_data.db")

# The earliest date we care about (set to today on first run)
START_DATE = date(2026, 4, 29)

# PSX closes at 15:30 PKT (UTC+5), so 10:30 UTC
# Schedule daily fetch at 16:00 PKT to be safe
EOD_FETCH_TIME = "16:00"  # 24h, PKT (local machine must be set to PKT or adjust accordingly)

# How many tickers to fetch in one batch (avoid hammering the server)
BATCH_SIZE = 50

# Seconds to wait between batches
BATCH_DELAY = 2

# PSX public holidays — active-flag sync is skipped on these days so that a
# closed market does not incorrectly mark listed stocks as inactive.
# Add dates here whenever PSX announces a holiday (Eid, national days, etc.).
PSX_HOLIDAYS: set[date] = {
    date(2026, 3, 23),   # Pakistan Day
    date(2026, 5,  1),   # Labour Day
}
