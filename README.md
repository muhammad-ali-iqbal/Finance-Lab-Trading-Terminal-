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

**Student pages:** Overview · Portfolio · Trade · Chart · Order Book · Orders · Profile

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
# Fill in: DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET

# Create database
psql -U postgres -c "CREATE DATABASE simtrader;"

# Run migrations
make migrate

# Start server  (Windows: double-click run.bat)
go run ./cmd/server/main.go
```

Server starts at **http://localhost:8080**. Default admin: `admin@simtrader.app` / `ChangeMe123!` — change on first login.

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
3. Fill in First name, Last name, Password (8+ chars, letter + number)
4. Student lands on their dashboard

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

### Backend (`.env`)

```env
PORT=8080
ENV=development          # development | production

DATABASE_URL=postgresql://user:password@localhost:5432/simtrader

# Generate each with: openssl rand -hex 64
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...

JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=168h

# Email — blank for dev (tokens print to console)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# For CORS + email links
FRONTEND_URL=http://localhost:5173
```

### Frontend (`.env.local`)

```env
# Override if backend runs on a different port (default: 8080)
# VITE_API_PORT=8080

# Override full WS URL for production
# VITE_WS_URL=wss://yourdomain.com
```

---

## Security

- **Short-lived access tokens** — 15-minute expiry
- **Refresh token rotation** — single-use, replayed tokens rejected
- **SHA-256 hashed refresh tokens** — raw tokens never stored in DB
- **bcrypt cost=12** — intentionally slow password hashing
- **Vague login errors** — doesn't reveal if email exists
- **Silent password reset** — always returns 200
- **Instant revocation** — blocking a user kills all their active sessions
- **Invite-only registration** — no self-signup

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

## Deployment

### Backend (Railway or any server)

1. Set `ENV=production` in environment variables
2. Set `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
3. Set `FRONTEND_URL` to your frontend domain (for CORS)
4. Run migrations
5. Build: `go build -o server ./cmd/server/main.go`

### Frontend (Vercel / Netlify / Cloudflare Pages)

```bash
npm run build   # outputs to dist/
```

Set in your hosting environment:
```
VITE_WS_URL=wss://your-backend-domain.com
```

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

<div align="center">

**IBA Finance Lab — SimTrader**

[Back to top](#simtrader--stock-market-simulation-platform)

</div>
