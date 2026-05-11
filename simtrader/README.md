# SimTrader Backend

Go REST + WebSocket API for the SimTrader educational trading platform. Powers both real-time simulation trading (replaying historical PSX data) and semester-long paper-trading Challenges (live PSX EOD data via psx_tracker).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Go | 1.22+ |
| PostgreSQL | 16+ |
| psql | any (included with PostgreSQL) |

---

## Daily Startup

Three things need to be running:

| # | What | Command |
|---|------|---------|
| 1 | PostgreSQL | Already running as a Windows service — nothing to do |
| 2 | Backend | Double-click `run.bat` in `simtrader/` |
| 3 | Frontend | `npm run dev` in `simtrader-frontend/` |
| 4 | PSX Tracker | `python main.py` in `psx_tracker/` (fetches + pushes EOD prices daily) |

The psx_tracker scheduler auto-backfills any days missed while offline, so gaps are handled on restart.

---

## First-Time Setup

### 1. Install Go dependencies

```bash
cd simtrader
go mod tidy
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```env
# Server
PORT=8080
ENV=development

# Database — if password contains @ encode it as %40
DATABASE_URL=postgres://username:password@localhost:5432/simtrader

# JWT — generate each with: openssl rand -hex 64
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=168h

# Email (leave blank for dev — tokens print to console instead)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# Frontend origin for CORS and email links
FRONTEND_URL=http://localhost:5173

# Shared secret for psx_tracker → SimTrader price push
INTERNAL_SECRET=dev-internal-secret
```

In `development` mode: CORS accepts any origin; emails print to terminal instead of sending.

### 3. Create the database

```cmd
psql -U postgres -c "CREATE DATABASE simtrader;"
```

### 4. Run migrations

Run each migration file in order (on Windows, `make` may not be available):

```cmd
psql "postgres://username:password@localhost:5432/simtrader" -f migrations/001_create_users.sql
psql "postgres://username:password@localhost:5432/simtrader" -f migrations/002_create_simulation_tables.sql
psql "postgres://username:password@localhost:5432/simtrader" -f migrations/004_challenges.sql
```

Or if you have `make` installed:

```bash
make migrate
```

This seeds the first admin account:
- **Email:** `admin@simtrader.app`
- **Password:** `ChangeMe123!`

Change this password immediately after first login.

### 5. Start the server

```cmd
run.bat
```

Or via terminal: `go run ./cmd/server/main.go`. Server starts at **http://localhost:8080**.

### 6. Seed historical price data (first time only)

Push all PSX price history from `psx_tracker`'s SQLite database into PostgreSQL:

```cmd
cd ..\psx_tracker
python sync_to_simtrader.py
```

This populates the `eod_prices` table used by the Challenges feature and EOD charts. Takes a few minutes on first run. After that, the daily psx_tracker scheduler keeps it current automatically.

---

## API Endpoints

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Complete registration from invite |
| POST | `/api/auth/refresh` | Rotate access + refresh tokens |
| POST | `/api/auth/logout` | Revoke refresh token |
| POST | `/api/auth/forgot-password` | Send password reset email |
| POST | `/api/auth/reset-password` | Set new password |

### Profile (student + admin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Get own profile |
| PUT | `/api/me` | Update name |
| PUT | `/api/me/password` | Change password |

### Admin — Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users/invite` | Invite a student |
| GET | `/api/admin/users/:id` | Get user details |
| POST | `/api/admin/users/:id/block` | Block student (revokes sessions) |
| POST | `/api/admin/users/:id/unblock` | Unblock student |

### Admin — Simulations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/simulations` | Create simulation |
| PUT | `/api/admin/simulations/:id` | Update name/description (draft only) |
| DELETE | `/api/admin/simulations/:id` | Delete (not active) |
| POST | `/api/admin/simulations/:id/upload` | Upload CSV price data |
| POST | `/api/admin/simulations/:id/start` | Start clock |
| POST | `/api/admin/simulations/:id/pause` | Pause clock |
| POST | `/api/admin/simulations/:id/resume` | Resume from pause |
| POST | `/api/admin/simulations/:id/restart` | Reset + restart from beginning |
| POST | `/api/admin/simulations/:id/complete` | Mark complete |

### Admin — Challenges
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/challenges` | Create challenge |
| GET | `/api/admin/challenges` | List all challenges |
| GET | `/api/admin/challenges/:id` | Get challenge details |
| PUT | `/api/admin/challenges/:id` | Update challenge (draft only) |
| POST | `/api/admin/challenges/:id/activate` | Open challenge to students |
| POST | `/api/admin/challenges/:id/complete` | Mark challenge as completed |
| POST | `/api/admin/challenges/:id/enroll-all` | Enroll all active students |
| POST | `/api/admin/challenges/:id/reconcile` | Manually trigger order fill for today |
| GET | `/api/admin/challenges/:id/leaderboard` | Full leaderboard (names + emails) |

### Student — Simulations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulations` | List all simulations |
| GET | `/api/simulations/active` | Get active simulation |
| GET | `/api/simulations/:id` | Get simulation by ID |
| GET | `/api/simulations/:id/symbols` | List symbols in simulation |
| GET | `/api/simulations/:id/progress` | Timer / progress info |
| GET | `/api/simulations/:id/ticks/:symbol` | Historical OHLCV bars |
| GET | `/api/simulations/:id/ws?token=...` | **WebSocket** — live tick stream |

### Student — Simulation Trading
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulations/:id/portfolio` | Portfolio, cash, positions |
| GET | `/api/simulations/:id/portfolio/history` | Equity curve |
| GET | `/api/simulations/:id/leaderboard` | Ranked by total equity |
| POST | `/api/simulations/:id/orders` | Submit order |
| GET | `/api/simulations/:id/orders` | List own orders |
| DELETE | `/api/simulations/:id/orders/:orderID` | Cancel pending order |
| GET | `/api/simulations/:id/orderbook/:symbol` | Bids/asks depth |

### Student — Challenges
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/challenges` | List active + completed challenges |
| GET | `/api/challenges/:id` | Get challenge details |
| POST | `/api/challenges/:id/join` | Join a challenge |
| GET | `/api/challenges/:id/portfolio` | Portfolio, cash, positions |
| GET | `/api/challenges/:id/portfolio/history` | Daily equity curve |
| POST | `/api/challenges/:id/orders` | Place order (fills at next EOD) |
| GET | `/api/challenges/:id/orders` | List own orders |
| POST | `/api/challenges/:id/orders/:oid/cancel` | Cancel pending order |
| GET | `/api/challenges/:id/leaderboard` | Anonymized leaderboard |

### EOD Chart Data (student + admin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/eod/symbols` | All PSX symbols with price data |
| GET | `/api/eod/:symbol` | Full daily OHLCV history for a symbol |

### Internal (psx_tracker only)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/internal/eod-prices` | Push daily prices (requires `X-Internal-Secret` header) |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB ping — 200 healthy / 503 unhealthy |

---

## WebSocket Protocol

**URL:** `GET /api/simulations/:id/ws?token=<accessToken>`

Authentication is via query parameter (browsers cannot set `Authorization` headers on WebSocket connections).

The server streams `SimulationTick` JSON on every clock tick:

```json
{
  "simulationTime": "2026-04-03T05:14:00Z",
  "ticks": [
    { "symbol": "PSO",  "open": 338.5, "high": 340.0, "low": 338.0, "close": 339.5, "volume": 12000 },
    { "symbol": "LUCK", "open": 100.2, "high": 101.0, "low": 100.0, "close": 100.8, "volume": 4500 }
  ]
}
```

---

## Project Structure

```
simtrader/
├── cmd/server/main.go           ← Entry point — wires all modules
├── internal/
│   ├── auth/                    ← JWT, invite tokens, password reset, mailer
│   ├── user/                    ← User model, /api/me, /api/admin/users/*
│   ├── simulation/              ← Clock engine, WebSocket hub, registry
│   │   ├── clock.go             ← Tick replay goroutine
│   │   ├── handler.go           ← HTTP + WebSocket handlers
│   │   ├── repository.go        ← DB queries, CSV ingestion
│   │   └── registry.go          ← Global map of running clocks
│   ├── challenge/               ← Semester-long challenge feature
│   │   ├── handler.go           ← All challenge HTTP handlers
│   │   ├── repository.go        ← DB queries (challenges, orders, positions, EOD)
│   │   └── reconciler.go        ← Nightly order fill engine (16:35 PKT)
│   ├── order/                   ← Simulation order fill engine
│   ├── portfolio/               ← Simulation portfolio + leaderboard
│   ├── httputil/errors.go       ← BadRequest / InternalError helpers
│   ├── middleware/auth.go        ← RequireAuth + RequireRole
│   ├── config/config.go         ← Env var loading
│   ├── db/db.go                 ← pgxpool connection
│   └── types/types.go           ← Shared interfaces
├── migrations/
│   ├── 001_create_users.sql
│   ├── 002_create_simulation_tables.sql
│   └── 004_challenges.sql       ← eod_prices, challenges, orders, positions, snapshots
├── .env
├── .env.example
├── go.mod
├── Makefile
└── run.bat
```

---

## Challenge Feature

Challenges are semester-long paper-trading competitions using live PSX data, distinct from Simulations which replay historical data at speed.

**Workflow:** Create → Activate → Enroll All → _(semester runs)_ → Complete

**Order fill model:**
- Students place orders any time during the day
- The reconciler runs at **16:35 PKT** daily (after market close)
- Market orders fill at that day's closing price
- Limit buy fills if `day's Low ≤ limitPrice`
- Limit sell fills if `day's High ≥ limitPrice`
- Orders with insufficient cash/shares are rejected

**Data flow:**
```
psx_tracker fetches EOD prices
    → POST /api/internal/eod-prices
        → stored in eod_prices table
            → reconciler triggered immediately for that date
```

**Manual reconcile:** Admin can trigger reconciliation for any date via the Challenges admin page or `POST /api/admin/challenges/:id/reconcile`.

---

## Simulation Clock

- One goroutine per active simulation
- Reads price ticks from DB in chronological order from `current_sim_time`
- Broadcasts to all connected WebSocket clients
- Calls order fill engine synchronously per tick
- Persists `current_sim_time` to DB after each tick (crash recovery)
- Speed: `speed_multiplier = 60` → 1 wall-second = 1 simulated minute

---

## Make Commands

```bash
make run          # go run ./cmd/server/main.go
make build        # compile to ./bin/server
make migrate      # run all migrations/*.sql via psql
make hash p=xxx   # print bcrypt hash of password xxx
make tidy         # go mod tidy
make lint         # go vet ./...
make clean        # remove ./bin/
```

---

## Security Notes

- Access tokens expire in **15 minutes**
- Refresh tokens are **single-use** with rotation — replayed tokens rejected
- Refresh tokens stored as **SHA-256 hashes** — raw tokens never in DB
- Passwords hashed with **bcrypt cost=12**
- Login errors deliberately vague — doesn't reveal if email exists
- Password reset always returns **200** — doesn't leak registration status
- Blocking a student immediately revokes all active sessions
- Invite-only registration — no self-signup path
- Internal EOD endpoint protected by `X-Internal-Secret` header
