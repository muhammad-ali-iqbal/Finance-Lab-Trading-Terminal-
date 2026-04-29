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
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tickers (
                symbol      TEXT PRIMARY KEY,
                added_on    DATE NOT NULL DEFAULT (date('now'))
            );

            CREATE TABLE IF NOT EXISTS daily_ohlcv (
                symbol  TEXT    NOT NULL,
                date    DATE    NOT NULL,
                open    REAL,
                high    REAL,
                low     REAL,
                close   REAL,
                volume  REAL,
                PRIMARY KEY (symbol, date),
                FOREIGN KEY (symbol) REFERENCES tickers(symbol)
            );

            CREATE INDEX IF NOT EXISTS idx_daily_date   ON daily_ohlcv(date);
            CREATE INDEX IF NOT EXISTS idx_daily_symbol ON daily_ohlcv(symbol);

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
            INSERT INTO daily_ohlcv(symbol, date, open, high, low, close, volume)
            VALUES (:symbol, :date, :open, :high, :low, :close, :volume)
            ON CONFLICT(symbol, date) DO UPDATE SET
                open=excluded.open, high=excluded.high,
                low=excluded.low,   close=excluded.close,
                volume=excluded.volume
            """,
            rows,
        )
    return len(rows)


def get_known_tickers() -> list[str]:
    with db() as conn:
        rows = conn.execute("SELECT symbol FROM tickers ORDER BY symbol").fetchall()
    return [r["symbol"] for r in rows]


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
