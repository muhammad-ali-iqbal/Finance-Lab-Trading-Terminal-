# SimTrader — Stock Market Simulation Platform

> A professional educational trading platform for students to practice real-world stock market scenarios using historical Pakistan Stock Exchange (PSX/KSE) data.

![Platform](https://img.shields.io/badge/platform-Web-blue)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?logo=postgresql)

---

## Overview

**SimTrader** is a full-stack stock market simulation platform built for classroom use at the IBA Finance Lab. Instructors create trading simulations with historical PSX data; students trade in real-time against each other.

Students can:
- Place **Market**, **Limit**, and **Stop** orders
- Monitor live portfolio performance (equity, P&L, positions)
- Analyze candlestick charts driven by real historical data
- View live order book depth (bids/asks)
- Compete via a real-time leaderboard
- Join semester-long **Challenges** on live PSX EOD data (orders fill nightly at market close)
- Browse live **PSX dividend announcements** and automatically receive **dividend cash / bonus shares** on stocks held in a challenge

---

## Architecture

```
Finance-Lab-Trading-Terminal-/
├── simtrader/            # Go backend API (port 8080)
├── simtrader-frontend/   # React + TypeScript SPA (port 5173)
└── simtrader-tools/      # Python data preparation scripts
```

### Request flow

```
Browser (student/admin)
        │
        ├── HTTP REST  ──→  :5173 (Vite proxy)  ──→  :8080 (Go backend)
        │
        └── WebSocket  ─────────────────────────────→  :8080 (Go backend)
                         (direct — bypasses Vite proxy)
```

The WebSocket connects **directly** to the Go backend on port 8080 using `window.location.hostname`. This avoids the unreliable WebSocket proxying in Vite's dev server and means port 8080 must be reachable by student devices.

---

## Components

### 1. Backend (`simtrader/`)

Go REST + WebSocket API.

| Technology | Role |
|-----------|------|
| Go Fiber v2 | HTTP framework |
| PostgreSQL 16+ (pgx) | Database |
| JWT (15min access / 7d refresh) | Authentication |
| gofiber/contrib/websocket | WebSocket hub |
| bcrypt cost=12 | Password hashing |
| Resend SMTP | Email (dev: prints to console) |

**Modules:** auth · user · simulation · order · portfolio · httputil · middleware

### 2. Frontend (`simtrader-frontend/`)

React SPA with dark/light mode and IBA branding.

| Technology | Role |
|-----------|------|
| React 18 + TypeScript | UI framework |
| Vite 5 | Dev server + build |
| Tailwind CSS 3 | Styling (IBA maroon accent) |
| Zustand | Auth state |
| TanStack React Query | Server state / cache |
| lightweight-charts v4 | Candlestick + line charts |
| React Router v6 | Client-side routing |

**Student pages:** Challenges (default) · Dividends · Profile · Historic simulation (Overview · Portfolio · Trade · Chart · Order Book · Orders)

**Admin pages:** Overview · Simulations · Students · Settings

### 3. Data Tools (`simtrader-tools/`)

Python scripts to convert PSX intraday exports to SimTrader CSV format.

---

## Quick Start

### Prerequisites

| Tool | Version |
|------|---------|
| Go | 1.22+ |
| Node.js | 18+ |
| PostgreSQL | 16+ |
| Python | 3.10+ |

### Backend setup

```bash
cd simtrader

# Configure
cp .env.example .env
# Fill in: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, INTERNAL_SECRET
# (leave ADMIN_*/SMTP_HOST blank in dev — a random admin password is printed on boot)

# Create database
psql -U postgres -c "CREATE DATABASE simtrader;"

# Run migrations
make migrate

# Start server  (Windows: double-click run.bat)
go run ./cmd/server/main.go
```

Server starts at **http://localhost:8080**.

> **Admin account:** there is **no shipped default password**. In production the server refuses to boot unless `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set. In local dev (no `ADMIN_*` set), a **random admin password is generated and printed once to the backend console** on first boot — copy it from the log. See [Configuration](#configuration).

### Frontend setup

```bash
cd simtrader-frontend
npm install
npm run dev
```

Frontend starts at **http://localhost:5173** and listens on all network interfaces automatically (LAN access included). API requests proxy through to `:8080`; WebSocket connects directly to `:8080`.

---

## LAN / Campus Demo Setup

To let students on the same WiFi connect from their own devices:

1. Find your machine's LAN IP (e.g. `10.2.104.37`)
2. Open port 8080 in Windows Firewall (one-time):
   ```
   netsh advfirewall firewall add rule name="SimTrader Backend" dir=in action=allow protocol=TCP localport=8080
   ```
3. Students open: `http://10.2.104.37:5173`
4. WebSocket auto-connects to `ws://10.2.104.37:8080` — no config needed

The frontend already listens on all interfaces (`host: true` in vite.config.ts). The WebSocket URL is derived from `window.location.hostname` at runtime, so it works correctly from any device.

---

## Session Workflow

### 1. Admin login
Open `http://localhost:5173` and log in with admin credentials.

### 2. Invite students
1. Go to **Admin → Students**
2. Click **Invite student**, enter the student's email
3. The invite token prints to the **Go terminal console** (dev mode — no email sent):
   ```
   [DEV EMAIL] Invite to student@iba.edu.pk → token: 608de6c4fb71ac...
   ```

### 3. Student registration
Each student needs a separate browser profile (or incognito window):

1. Open a new Chrome profile
2. Navigate to `http://localhost:5173/register?token=<TOKEN>`
3. Fill in First name, Last name, Password (**12+ chars**; common passwords are rejected)
4. Student lands on their dashboard

> Invite links **expire after 7 days**. If a token lapses, re-invite the student to mint a fresh one.

### 4. Create & start a simulation
1. Go to **Admin → Simulations**
2. Click **New simulation**, set name / speed / starting cash
3. Upload the PSX CSV (prepared via `simtrader-tools/`)
4. Click **Start** — status changes to `active`

### 5. Students trade
- Dashboard shows live portfolio, leaderboard, recent orders
- Chart page shows candlestick OHLCV updated in real time
- Trade page accepts Market / Limit / Stop orders
- Order Book shows live bids/asks depth

### Multi-device classroom setup
| Who | Setup |
|-----|-------|
| Instructor | Laptop, Chrome Profile 1 (admin) |
| Student 1 | Any device at `http://<instructor-IP>:5173` |
| Student 2 | Any device at `http://<instructor-IP>:5173` |
| ... | Separate browser session per student |

---

## API Reference

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Complete registration (invite token) |
| POST | `/api/auth/refresh` | Rotate tokens |
| POST | `/api/auth/logout` | Revoke session |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Set new password |

### Profile
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/me` | Get own profile |
| PUT | `/api/me` | Update name |
| PUT | `/api/me/password` | Change password |

### Admin — Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users/invite` | Invite student |
| POST | `/api/admin/users/:id/block` | Block student |
| POST | `/api/admin/users/:id/unblock` | Unblock student |

### Admin — Simulations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/simulations` | Create simulation |
| POST | `/api/admin/simulations/:id/upload` | Upload CSV |
| PUT | `/api/admin/simulations/:id/upload` | Replace CSV |
| POST | `/api/admin/simulations/:id/start` | Start |
| POST | `/api/admin/simulations/:id/pause` | Pause |
| POST | `/api/admin/simulations/:id/resume` | Resume |
| POST | `/api/admin/simulations/:id/restart` | Restart from beginning |
| POST | `/api/admin/simulations/:id/complete` | Mark complete |

### Student — Simulations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulations` | List all |
| GET | `/api/simulations/active` | Get active simulation |
| GET | `/api/simulations/:id/progress` | Timer / progress data |
| GET | `/api/simulations/:id/ticks/:symbol` | Historical OHLCV |
| GET | `/api/simulations/:id/ws?token=...` | WebSocket (live ticks) |

### Student — Dividends & Market Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dividends` | Latest PSX dividend/bonus/right announcements (cached proxy of dps.psx.com.pk) |
| GET | `/api/dividends?symbol=HBL` | Same, filtered by ticker |
| GET | `/api/dividends/symbols` | PSX securities directory (powers search suggestions) |
| GET | `/api/challenges/:id/dividends` | Payouts credited to the student in a challenge |

### Student — Trading
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulations/:id/portfolio` | Portfolio + positions |
| GET | `/api/simulations/:id/portfolio/history` | Equity curve data |
| GET | `/api/simulations/:id/leaderboard` | Ranked leaderboard |
| POST | `/api/simulations/:id/orders` | Submit order |
| GET | `/api/simulations/:id/orders` | List own orders |
| DELETE | `/api/simulations/:id/orders/:orderID` | Cancel pending order |
| GET | `/api/simulations/:id/orderbook/:symbol` | Order book depth |

---

## Configuration

For the **docker-compose stack**, copy the root `.env.example` to `.env` and fill it in — `docker compose up` fails fast if any required value is empty. The backend's own `.env` (below) is for running it standalone in dev.

```env
PORT=8080
ENV=development          # development | production

DATABASE_URL=postgresql://user:password@localhost:5432/simtrader?sslmode=require

# Generate each with: openssl rand -hex 64
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...

JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=168h     # malformed values now fail startup (no silent default)

# Internal shared secret with psx_tracker (REQUIRED, no default).
# Generate with: openssl rand -hex 32
INTERNAL_SECRET=...

# Admin account — REQUIRED in production (server refuses to boot without these).
# In dev, omit to get a random one-time password printed to the console.
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=...           # 12+ chars, not a common password

# Email — REQUIRED in production. The backend will NOT start in production
# without SMTP_HOST (otherwise invite/reset tokens would print to logs).
# In dev, leave SMTP_HOST blank and tokens print to the console.
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# For CORS + email links (use your HTTPS domain in production)
FRONTEND_URL=http://localhost:5173
```

**Optional / advanced:**

| Variable | Default | Purpose |
|----------|---------|---------|
| `CORS_ALLOW_ANY` | `false` | Dev-only: reflect any CORS origin. Ignored in production. |
| `TRUSTED_PROXIES` | RFC1918 + loopback | CIDRs Fiber trusts for the real client IP behind the proxy (rate limiting). |
| `DB_REQUIRE_TLS` | `true` (prod) | Set `false` **only** for the internal-network compose Postgres. A managed/remote DB must keep TLS on and use `sslmode=require`. |

### Frontend (`.env.local`)

```env
# Override if backend runs on a different port (default: 8080)
# VITE_API_PORT=8080

# Override full WS URL for production
# VITE_WS_URL=wss://yourdomain.com
```

---

## Security

A full code-level audit and remediation pass has been completed — see
**[SimTrader_Remediation_Report.md](SimTrader_Remediation_Report.md)** for the
finding-by-finding detail.

**Authentication & sessions**
- **Short-lived access tokens** (15 min) + **single-use refresh-token rotation**
- **All sensitive tokens SHA-256 hashed in DB** — refresh, **invite, and reset** tokens; raw values never stored
- **Invite tokens expire after 7 days**; reset tokens after 1 hour
- **bcrypt cost=12**; password policy: 12+ chars, common-password denylist, 72-byte cap
- **Near-instant block enforcement** — a blocked user loses access within ~30s, not just on token expiry
- **Invite-only registration**, vague login errors, silent password reset (no enumeration)
- **No default admin** — production requires `ADMIN_EMAIL`/`ADMIN_PASSWORD`; the seed account ships blocked

**Transport & network**
- **TLS everywhere** via the Caddy reverse proxy (automatic HTTPS + HSTS)
- **Security headers** — CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` (helmet + nginx)
- **Rate limiting** keyed on the real client IP (trusted-proxy aware), including a dedicated limiter on `/refresh`
- **Internal EOD endpoint** is denied from the public path and rate-limited; secret compared in constant time
- **Strict CORS** — no wildcard reflection in production; DB connections require TLS in production

**Data integrity & operations**
- **Transactional, idempotent reconciler** — challenge order fills can't double-charge or leave inconsistent balances
- **Parameterized SQL throughout** (pgx) — no injection vector
- **Avatar uploads validated by file signature**, served with `nosniff`
- **Retention cleanup** of expired/revoked tokens; **hardened migration runner** (single-transaction, advisory-locked, versioned)
- **Dependency scanning** in CI (govulncheck / npm audit / pip-audit)

---

## Troubleshooting

### "Connecting to simulation..." never resolves

1. Check the Go backend is running: `http://localhost:8080/health`
2. Check the simulation status is `active` in the admin panel
3. Check port 8080 firewall rule is in place (for LAN access)
4. Open browser DevTools → Console, look for:
   ```
   [ws-pool] Connecting to: ws://10.x.x.x:8080/api/simulations/.../ws?token=...
   ```
   If the URL is wrong, check `VITE_API_PORT` in `.env.local`
5. Check the Go terminal for `[ws] user=... connected` — if absent, the WebSocket upgrade failed

### WebSocket connects from localhost but not from mobile/other devices

Port 8080 is blocked by Windows Firewall. Add the rule:
```
netsh advfirewall firewall add rule name="SimTrader Backend" dir=in action=allow protocol=TCP localport=8080
```

### Port 8080 already in use on startup

A previous server process is still running:
```
taskkill /F /IM server.exe /T
taskkill /F /IM main.exe /T
```

### Admin panel returns 404 on simulation controls

All admin simulation endpoints require the `/admin/` prefix:
- `POST /api/admin/simulations/:id/start`
- `POST /api/admin/simulations/:id/pause`
- etc.

### Invite token not received

In dev mode, emails are not sent. Check the **Go terminal** for:
```
[DEV EMAIL] Invite to student@iba.edu.pk → token: <64-char-hex>
```
Use that token in: `http://localhost:5173/register?token=<TOKEN>`

### "Portfolio not found" error on order submission

The portfolio is created lazily on first visit to the Portfolio page. The student must load `/dashboard/portfolio` once before placing orders.

### Blank page on `npm run dev`

TypeScript compilation errors. Run `npm run build` to see them, fix, then restart.

---

## Development Commands

### Backend
```bash
make run          # Start dev server (:8080)
make build        # Compile to ./bin/server
make migrate      # Run DB migrations
make hash p=xxx   # Generate bcrypt hash
make tidy         # Download dependencies
```

Windows alternative: double-click `simtrader/run.bat`

### Frontend
```bash
npm run dev       # Start Vite dev server (:5173, all interfaces)
npm run build     # TypeScript check + production build
npm run preview   # Preview production build
```

### Data Tools
```bash
cd simtrader-tools

python psx_to_simtrader.py -i ./raw -o simulation.csv -d 2026-04-03
python validate_simtrader_csv.py simulation.csv
```

---

### Recommended: full stack via Docker Compose (with TLS)

The repo ships a production-ready `docker-compose.yml` that runs the whole
stack — **Caddy** (TLS termination + automatic HTTPS), the nginx frontend, the
Go backend, PostgreSQL, and the psx_tracker scheduler — on a single host. This
is the recommended deployment (it also matches the eventual VPS target, so the
pen-test surface is identical).

```bash
# 1. Configure (compose refuses to start if any required secret is empty)
cp .env.example .env
#    Fill in: POSTGRES_PASSWORD, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
#    INTERNAL_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, SMTP_HOST, DOMAIN, ACME_EMAIL
#    Generate secrets: openssl rand -hex 64 (JWT) / -hex 32 (INTERNAL/POSTGRES)

# 2. Point DOMAIN at this host's public DNS (or DOMAIN=localhost for local-only).
#    Caddy obtains/renews Let's Encrypt certs automatically.

# 3. Launch
docker compose up -d --build
```

Caddy publishes **:80 → :443** (HTTP redirects to HTTPS); no other port is
exposed to the host. Migrations run automatically on backend boot
(single-transaction, advisory-locked, version-tracked).

> **Managed/remote Postgres** (Render, Railway, Neon, etc.): drop
> `DB_REQUIRE_TLS=false` from the backend env and use a `DATABASE_URL` with
> `sslmode=require` — TLS enforcement re-engages automatically.

### Split deployment (static frontend + separate backend)

The frontend can also be hosted on a static CDN (Vercel / Netlify / Cloudflare
Pages) with the backend on a container host:

```bash
cd simtrader-frontend && npm run build   # outputs to dist/
```

Set in the frontend hosting environment, and `FRONTEND_URL` (CORS) on the backend:
```
VITE_WS_URL=wss://your-backend-domain.com
```

In all cases set `ENV=production` and the required secrets above; the backend
fails fast if any are missing or misconfigured.

---

## Data Preparation

See **[simtrader-tools/README.md](simtrader-tools/README.md)** for the full PSX data workflow.

Quick reference:
```bash
cd simtrader-tools
python psx_to_simtrader.py -i ./raw -o simulation.csv -d 2026-04-03
python validate_simtrader_csv.py simulation.csv
# Upload simulation.csv via Admin → Simulations → Upload CSV
```

---

## Choosing Simulation Dates

| Date type | Market behavior | Teaching value |
|-----------|----------------|----------------|
| Normal day | Clean, predictable | Intro sessions |
| Earnings day | One stock moves sharply | Event-driven trading |
| Market selloff | All stocks fall | Portfolio risk |
| High volatility (KSE-100 >1% swing) | Sharp moves | Stop-loss lessons |
| Low volatility | Flat price action | Limit order patience |

---

## Changelog

### 2026-07-13

**Dividend Announcements section (student dashboard)**
- New **Dividends** page (`/dashboard/dividends`) showing live PSX dividend, bonus and right share announcements, proxied from the PSX Data Portal payouts feed (`dps.psx.com.pk/payouts`) and cached server-side for 30 minutes — no manual refresh needed
- Typeahead search over the full PSX securities directory: type a ticker **or** a company name ("habib bank" resolves to HBL); suggestions are ranked and keyboard-navigable
- Each symbol links to its company page on the PSX data portal
- Announcement types decoded into badges: **(D)** cash dividend · **(B)** bonus shares · **(R)** right shares; **(F)** final / **(i)** interim shown in the payout column

**Dividends now pay out in Challenges**
- The nightly reconciler (16:35 PKT) credits payouts for stocks participants hold, before that day's order fills:
  - **Cash dividends** — percent of the standard PKR 10 face value (e.g. "60% (D)" = PKR 6.00/share) added to cash balance
  - **Bonus shares** — added to the position (floored), with average cost diluted so cost basis is preserved
  - **Right issues** — not auto-applied (require subscription)
- Entitlement follows the book-closure start date and is bounded to the challenge period; a `challenge_dividends` ledger with a uniqueness constraint guarantees each payout is credited exactly once (migration `011`)
- Portfolio tab shows a **Dividends & Payouts** history card; admin reconcile responses report `payoutsApplied`

**Login / signup consistency & security**
- Frontend password rules now match the backend policy everywhere (register, reset, student & admin change-password): **12–72 characters**, single shared validator (`src/utils/password.ts`) — previously forms showed an 8-character rule the server would reject
- **Fixed a security bug**: authenticated password change (`PUT /api/me/password`) stored the new password in **plaintext** instead of bcrypt-hashing it, silently breaking subsequent logins; all password-persisting paths now hash through one shared `internal/passwords.Hash` (bcrypt cost 12)
- Token expiry audited end-to-end (JWT access/refresh, invite, reset): all comparisons correct and UTC-safe — no changes required

**Navigation**
- Students now land on **Challenges** after login; the historic-simulation Overview moved to `/dashboard/overview` under the collapsed "Historic Simulation" nav group

---

<div align="center">

**IBA Finance Lab — SimTrader**

[Back to top](#simtrader--stock-market-simulation-platform)

</div>
