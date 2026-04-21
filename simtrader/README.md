# SimTrader Backend

Go REST + WebSocket API for the SimTrader educational trading platform.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Go | 1.22+ |
| PostgreSQL | 16+ |
| psql | any (included with PostgreSQL) |

---

## First-Time Setup

### 1. Install dependencies

```bash
cd simtrader
make tidy
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_ACCESS_SECRET` — run `openssl rand -hex 64`
- `JWT_REFRESH_SECRET` — run `openssl rand -hex 64` again (different value)
- `FRONTEND_URL` — your frontend origin (for CORS); use LAN IP for classroom demos

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE simtrader;"
```

### 4. Run migrations

```bash
make migrate
```

Seeds the first admin account:
- **Email:** `admin@simtrader.app`
- **Password:** `ChangeMe123!`

Change this password immediately after first login.

### 5. Start the server

```bash
make run
# Windows: double-click run.bat
```

Server starts at **http://localhost:8080**.

---

## Environment Variables

```env
# Server
PORT=8080
ENV=development          # development | production

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/simtrader

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

# Frontend origin for CORS headers and email links
FRONTEND_URL=http://localhost:5173
```

In `development` mode:
- CORS accepts **any** origin (safe for LAN demos)
- Emails print to the terminal instead of being sent

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
| PUT | `/api/admin/simulations/:id/upload` | Replace CSV data |
| POST | `/api/admin/simulations/:id/start` | Start clock |
| POST | `/api/admin/simulations/:id/pause` | Pause clock |
| POST | `/api/admin/simulations/:id/resume` | Resume from pause |
| POST | `/api/admin/simulations/:id/restart` | Reset + restart from beginning |
| POST | `/api/admin/simulations/:id/complete` | Mark complete |

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

### Student — Trading
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulations/:id/portfolio` | Portfolio, cash, positions |
| GET | `/api/simulations/:id/portfolio/history` | Equity curve (time series) |
| GET | `/api/simulations/:id/leaderboard` | Ranked by total equity |
| POST | `/api/simulations/:id/orders` | Submit order |
| GET | `/api/simulations/:id/orders` | List own orders |
| DELETE | `/api/simulations/:id/orders/:orderID` | Cancel pending order |
| GET | `/api/simulations/:id/orderbook/:symbol` | Bids/asks depth |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | DB ping — 200 healthy / 503 unhealthy |

---

## WebSocket Protocol

**URL:** `GET /api/simulations/:id/ws?token=<accessToken>`

Authentication is via query parameter (browsers cannot set `Authorization` headers on WebSocket connections).

The server streams `SimulationTick` JSON messages on every clock tick:

```json
{
  "simulationTime": "2026-04-03T05:14:00Z",
  "ticks": [
    { "symbol": "PSO",  "open": 338.5, "high": 340.0, "low": 338.0, "close": 339.5, "volume": 12000, "simTime": "..." },
    { "symbol": "LUCK", "open": 100.2, "high": 101.0, "low": 100.0, "close": 100.8, "volume": 4500,  "simTime": "..." }
  ]
}
```

The clock is registered in a global `Registry`. If the simulation is not active, the WebSocket returns 404 before upgrading.

---

## Project Structure

```
simtrader/
├── cmd/
│   └── server/
│       └── main.go              ← Entry point — wires all modules together
├── internal/
│   ├── auth/
│   │   ├── service.go           ← JWT generation, invite tokens, password reset
│   │   ├── handler.go           ← /api/auth/* HTTP handlers
│   │   └── mailer.go            ← SMTP + NoOpMailer (dev)
│   ├── user/
│   │   ├── model.go             ← User struct, PublicProfile
│   │   ├── repository.go        ← DB queries
│   │   └── handler.go           ← /api/me and /api/admin/users/* handlers
│   ├── simulation/
│   │   ├── clock.go             ← Tick replay engine (one goroutine per sim)
│   │   ├── handler.go           ← HTTP + WebSocket handlers
│   │   ├── repository.go        ← DB queries, CSV ingestion
│   │   └── registry.go          ← Global map of running clocks
│   ├── order/
│   │   ├── engine.go            ← Fill logic — runs on each clock tick
│   │   └── handler.go           ← Order CRUD + order book handler + repo
│   ├── portfolio/
│   │   └── portfolio.go         ← Portfolio, history, leaderboard handler + repo
│   ├── httputil/
│   │   └── errors.go            ← BadRequest / InternalError helpers
│   ├── middleware/
│   │   └── auth.go              ← RequireAuth + RequireRole middleware
│   ├── config/
│   │   └── config.go            ← Env var loading
│   ├── db/
│   │   └── db.go                ← pgxpool connection
│   └── types/
│       └── types.go             ← Shared interfaces (OrderFiller, etc.)
├── migrations/
│   └── *.sql                    ← Schema + seed data
├── .env                         ← Local environment (not committed)
├── .env.example                 ← Template
├── go.mod
├── Makefile
└── run.bat                      ← Windows: double-click to start server
```

---

## Simulation Clock

- One goroutine per active simulation
- Reads price ticks from DB in chronological order starting from `current_sim_time`
- Broadcasts ticks to all connected WebSocket clients
- Calls the order fill engine synchronously per tick
- Persists `current_sim_time` to DB after each tick (crash recovery)
- Speed: `speed_multiplier = 60` → 1 wall-second = 1 simulated minute

Only one simulation can be `active` at a time. The `Registry` map is package-level and safe for concurrent access.

---

## Order Fill Engine

Market orders fill at the current tick's close price on the next tick after submission. Limit orders fill when the tick price crosses the limit. Stop orders trigger when the price hits the stop, then fill at market.

Fills update the portfolio's positions and cash balance within a single DB transaction. Partially-filled orders are supported.

---

## Make Commands

```bash
make run          # go run ./cmd/server/main.go
make build        # compile to ./bin/server
make migrate      # run all *.sql in migrations/ via psql
make hash p=xxx   # print bcrypt hash of password xxx
make tidy         # go mod tidy
make lint         # go vet ./...
make clean        # remove ./bin/
```

---

## Security Notes

- Access tokens expire in **15 minutes** — short window if stolen
- Refresh tokens are **single-use** (rotation) — replayed tokens rejected
- Refresh tokens stored as **SHA-256 hashes** — raw tokens never touch the DB
- Passwords hashed with **bcrypt cost=12** — intentionally slow
- Login errors are **deliberately vague** — doesn't reveal if email exists
- Password reset always returns **200** — doesn't leak registration status
- Blocking a student **immediately revokes** all their active sessions
- Invite-only registration — no self-signup path
