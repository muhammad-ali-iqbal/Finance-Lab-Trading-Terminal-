import sqlite3
from contextlib import contextmanager
from config import DB_PATH


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS tickers (
                symbol      TEXT PRIMARY KEY,
                added_on    DATE NOT NULL DEFAULT (date('now')),
                status      INTEGER NOT NULL DEFAULT 1
            )
        """)
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(tickers)").fetchall()}
        if "status" not in cols:
            if "is_active" in cols:
                # Earlier schema used is_active — rename so old data carries over.
                conn.execute("ALTER TABLE tickers RENAME COLUMN is_active TO status")
                print("[DB] Migrated: renamed tickers.is_active -> status.")
            else:
                conn.execute("ALTER TABLE tickers ADD COLUMN status INTEGER NOT NULL DEFAULT 1")
                print("[DB] Migrated: added tickers.status column.")
        # Drop the old index if it survived a rename, then (re)create on status.
        conn.execute("DROP INDEX IF EXISTS idx_tickers_active")

        # Migration: add status to daily_ohlcv if it doesn't exist yet,
        # then back-fill from tickers.status.
        ohlcv_cols = {r["name"] for r in conn.execute("PRAGMA table_info(daily_ohlcv)").fetchall()}
        if "status" not in ohlcv_cols and ohlcv_cols:
            conn.execute("ALTER TABLE daily_ohlcv ADD COLUMN status INTEGER NOT NULL DEFAULT 1")
            conn.execute("""
                UPDATE daily_ohlcv
                SET status = (
                    SELECT t.status FROM tickers t WHERE t.symbol = daily_ohlcv.symbol
                )
            """)
            print("[DB] Migrated: added daily_ohlcv.status and back-filled from tickers.")

        conn.executescript("""
            CREATE TABLE IF NOT EXISTS daily_ohlcv (
                symbol  TEXT    NOT NULL,
                date    DATE    NOT NULL,
                open    REAL,
                high    REAL,
                low     REAL,
                close   REAL,
                volume  REAL,
                status  INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (symbol, date),
                FOREIGN KEY (symbol) REFERENCES tickers(symbol)
            );

            CREATE INDEX IF NOT EXISTS idx_daily_date     ON daily_ohlcv(date);
            CREATE INDEX IF NOT EXISTS idx_daily_symbol   ON daily_ohlcv(symbol);
            CREATE INDEX IF NOT EXISTS idx_daily_status   ON daily_ohlcv(status);
            CREATE INDEX IF NOT EXISTS idx_tickers_status ON tickers(status);

            CREATE TABLE IF NOT EXISTS fetch_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                fetch_date  DATE    NOT NULL,
                status      TEXT    NOT NULL,
                rows_saved  INTEGER DEFAULT 0,
                error       TEXT,
                created_at  DATETIME DEFAULT (datetime('now'))
            );
        """)
    print("[DB] Schema initialised.")


def upsert_tickers(symbols: list[str]):
    with db() as conn:
        conn.executemany(
            "INSERT OR IGNORE INTO tickers(symbol) VALUES (?)",
            [(s,) for s in symbols],
        )
    print(f"[DB] Tickers stored: {len(symbols)}")


def upsert_ohlcv(rows: list[dict]):
    """rows: list of dicts with keys symbol, date, open, high, low, close, volume"""
    if not rows:
        return 0
    with db() as conn:
        conn.executemany(
            """
            INSERT INTO daily_ohlcv(symbol, date, open, high, low, close, volume, status)
            VALUES (
                :symbol, :date, :open, :high, :low, :close, :volume,
                (SELECT status FROM tickers WHERE symbol = :symbol)
            )
            ON CONFLICT(symbol, date) DO UPDATE SET
                open=excluded.open,     high=excluded.high,
                low=excluded.low,       close=excluded.close,
                volume=excluded.volume, status=excluded.status
            """,
            rows,
        )
    return len(rows)


def get_known_tickers(include_inactive: bool = False) -> list[str]:
    """Return ticker symbols. By default only active series (status=1) are returned."""
    sql = "SELECT symbol FROM tickers"
    if not include_inactive:
        sql += " WHERE status = 1"
    sql += " ORDER BY symbol"
    with db() as conn:
        rows = conn.execute(sql).fetchall()
    return [r["symbol"] for r in rows]


def set_active_tickers(active_symbols):
    """
    Mark `active_symbols` with status=1 and every other known ticker with status=0.
    Returns (active_count, inactive_count).
    """
    active_set = {s for s in active_symbols if s}
    with db() as conn:
        conn.execute("UPDATE tickers SET status = 0")
        if active_set:
            conn.executemany(
                "UPDATE tickers SET status = 1 WHERE symbol = ?",
                [(s,) for s in active_set],
            )
        active_count = conn.execute(
            "SELECT COUNT(*) FROM tickers WHERE status = 1"
        ).fetchone()[0]
        inactive_count = conn.execute(
            "SELECT COUNT(*) FROM tickers WHERE status = 0"
        ).fetchone()[0]
    return active_count, inactive_count


def last_fetch_date():
    with db() as conn:
        row = conn.execute(
            "SELECT MAX(date) AS d FROM daily_ohlcv"
        ).fetchone()
    return row["d"] if row else None


def log_fetch(fetch_date, status, rows_saved=0, error=None):
    with db() as conn:
        conn.execute(
            "INSERT INTO fetch_log(fetch_date, status, rows_saved, error) VALUES (?,?,?,?)",
            (str(fetch_date), status, rows_saved, error),
        )
