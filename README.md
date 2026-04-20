# SimTrader — Stock Market Simulation Platform

> A professional educational trading platform for students to practice real-world stock market scenarios using historical Pakistan Stock Exchange (PSX/KSE) data.

![Platform](https://img.shields.io/badge/platform-Web-blue)
![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791?logo=postgresql)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🎯 Overview

**SimTrader** is a full-stack stock market simulation platform designed for educational purposes. It enables instructors to create realistic trading environments where students can:

- Practice buying and selling stocks using **Market**, **Limit**, and **Stop** orders
- Monitor real-time portfolio performance with P&L tracking
- Analyze live candlestick charts using historical PSX data
- View order book depth (bids/asks) for market microstructure lessons
- Learn risk management through simulated market conditions

The platform uses **real historical data** from the Pakistan Stock Exchange, converted from Bloomberg Terminal exports, providing students with authentic market scenarios.

---

## 🏗️ Architecture

SimTrader is a monorepo consisting of three main components:

```
simtrader-simulation/
├── simtrader/                # Go backend API (port 8080)
├── simtrader-frontend/       # React + TypeScript SPA (port 5173)
└── simtrader-tools/          # Python data preparation toolkit
```

### System Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  Student Browser                            │
│              simtrader-frontend (:5173)                     │
│                                                             │
│  ┌──────────┐  ┌────────┐  ┌───────┐  ┌──────────┐          |
│  │Portfolio │  │ Trading│  │ Charts│  │Order Book│          │
│  └────┬─────┘  └───┬────┘  └───┬───┘  └────┬─────┘          │
└───────┼────────────┼───────────┼─────────────┼──────────────┘
        │            │           │             │
        └────────────┴───────────┼─────────────┘
                                 │
                    HTTP REST + WebSocket API
                                 │
┌────────────────────────────────┼───────────────────────────┐
│        simtrader Backend (:8080)                           │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │       Go Fiber HTTP Server + WebSocket Hub           │  │
│  └─────────────────────┬────────────────────────────────┘  │
│                        │                                   │
│    ┌───────────────────┼───────────────────┐               │
│    │       Business Logic Layer            │               │
│    │  auth │ user │ simulation │ order │ portfolio         │
│    └───────────────────┬───────────────────┘               │
│                        │                                   │
│                 ┌──────┴──────┐                            │
│                 │ PostgreSQL  │                            │
│                 │  Database   │                            │
│                 └─────────────┘                            │
└────────────────────────────────────────────────────────────┘
                                 ▲
                                 │
                    simtrader-tools/
              (Bloomberg PSX data → CSV upload)
```

---

## 📦 Components

### 1. Backend (`simtrader/`)

A high-performance Go REST API built with **Go Fiber** that handles authentication, user management, simulation orchestration, order processing, and real-time WebSocket data broadcasting.

**Tech Stack:**
- **Framework:** Go Fiber v2
- **Database:** PostgreSQL 16+ (pgx driver)
- **Authentication:** JWT with rotating refresh tokens
- **Security:** bcrypt (cost=12), SHA-256 token hashing
- **WebSocket:** nhooyr.io/websocket
- **Email:** SMTP via Resend (NoOp dev mode)

**Key Features:**
- Role-based access control (Admin/Student)
- Invite-only student registration
- Secure authentication with short-lived tokens
- Simulation management and real-time tick broadcasting
- Order book depth and portfolio tracking

📖 **[Backend Documentation](simtrader/README.md)**

---

### 2. Frontend (`simtrader-frontend/`)

A modern React single-page application providing a professional trading dashboard with real-time data visualization, order entry, portfolio tracking, and charting.

**Tech Stack:**
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite 5
- **Styling:** Tailwind CSS 3
- **State Management:** Zustand + TanStack React Query
- **Charts:** TradingView lightweight-charts
- **Data Grid:** AG Grid Community
- **Routing:** React Router DOM v6

**Dashboard Features:**
- **Portfolio** — Total equity, positions, unrealized P&L
- **Order Entry** — Buy/sell with Market, Limit, Stop orders
- **Charts** — Real-time candlestick OHLCV visualization
- **Order Book** — Depth of market (bids/asks)
- **Orders** — Order history with status tracking
- **Profile** — User settings and password management

**Real-time Data:**
- WebSocket connection with automatic reconnection
- Exponential backoff strategy (up to 10 attempts)
- Live price map updates for all symbols

📖 **[Frontend Documentation](simtrader-frontend/README.md)** *(if exists)*

---

### 3. Data Tools (`simtrader-tools/`)

A Python toolkit for converting Bloomberg Terminal PSX data exports into SimTrader-compatible CSV format for simulation uploads.

**Tech Stack:**
- Python 3.10+ (standard library only)

**Workflow:**
1. Export 1-minute OHLC bars from Bloomberg for 20-25 PSX stocks
2. Save as text files in `raw/` directory
3. Run converter: `python bloomberg_to_simtrader.py --input-dir ./raw --output sim.csv --date 2026-04-01`
4. Validate: `python validate_simtrader_csv.py sim.csv`
5. Upload CSV via admin panel

**PSX Session Details:**
- Market hours: 09:30-15:30 PKT (04:30-10:30 UTC)
- 360 one-minute bars per symbol per day
- Automatic forward-fill for missing bars

**Recommended Stock Categories:**

| Category | Examples | Teaching Purpose |
|----------|----------|------------------|
| **Large Cap** | LUCK, ENGRO, HBL, UBL, MCB | Tight spreads, market orders |
| **Mid Cap** | OGDC, PPL, PSO, HUBC | Moderate volatility |
| **Volatile** | SYS, TRG, AVN | High beta for limit/stop lessons |
| **Defensive** | NESTLE, COLG, SRVI | Low volatility, position sizing |

📖 **[Tools Documentation](simtrader-tools/README.md)**

---

## 🚀 Quick Start

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Go | 1.22+ | https://go.dev/dl/ |
| Node.js | 18+ | https://nodejs.org/ |
| PostgreSQL | 16+ | https://www.postgresql.org/download/ |
| Python | 3.10+ | https://www.python.org/downloads/ |
| make | any | Pre-installed (macOS/Linux); Git Bash (Windows) |

---

### Backend Setup

```bash
cd simtrader

# Install dependencies
make tidy

# Configure environment
cp .env.example .env
# Edit .env and fill in:
#   DATABASE_URL=postgresql://user:password@localhost:5432/simtrader
#   JWT_ACCESS_SECRET=<openssl rand -hex 64>
#   JWT_REFRESH_SECRET=<openssl rand -hex 64>

# Create database
psql -U postgres -c "CREATE DATABASE simtrader;"

# Run migrations
make migrate
```

**Start the backend server** (keep this running in a terminal):

```bash
go run ./cmd/server/main.go
```

Server starts at **http://localhost:8080**

**Default Admin Credentials:**
- Email: `admin@simtrader.app`
- Password: `ChangeMe123!`

⚠️ **Change this password immediately after first login.**

---

### Frontend Setup

```bash
cd simtrader-frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Frontend starts at **http://localhost:5173**

The Vite dev server proxies API requests (`/api/*`) and WebSocket connections to the backend at `:8080`, eliminating CORS issues during development.

---

### 📋 Session Workflow (Admin + Students)

This section describes the end-to-end flow for running a SimTrading session in a lab environment.

#### Step 1: Admin Login
1. Open a browser window (Chrome Profile 1)
2. Navigate to `http://localhost:5173`
3. Login with admin credentials

#### Step 2: Invite Students
1. Go to **Admin → Students** (`/admin/users`)
2. Click **Invite student**
3. Enter the student's email (e.g., `student@iba.edu.pk`)
4. Click **Send invite**

**⚠️ Important:** The invite token is printed in the **Go backend terminal console** (not emailed in dev mode). Look for:
```
[DEV EMAIL] Invite to student@iba.edu.pk → token: 608de6c4fb71ac7762a39bc755361875dea7e58e3ec8a45b666bc91097246d5d
```

#### Step 3: Student Registration
Each student needs their own browser profile (or incognito window) to maintain separate sessions:

1. **Open a new Chrome profile** (or incognito window)
2. Navigate to:
   ```
   http://localhost:5173/register?token=<TOKEN_FROM_CONSOLE>
   ```
   Replace `<TOKEN_FROM_CONSOLE>` with the actual token from step 2.
3. Fill in **First name**, **Last name**, and **Password** (8+ chars with number and letter)
4. Click **Create account**
5. Student is redirected to their dashboard

**Repeat for each student** — one browser profile per student.

#### Step 4: Create & Start a Simulation
1. Back in the **Admin** browser, go to **Simulations** (`/admin/simulations`)
2. Click **New simulation**
3. Fill in name, speed multiplier, starting cash
4. Upload the PSX CSV data file (prepared via `simtrader-tools/`)
5. Click **Start** — the simulation status changes to `active`

#### Step 5: Students Start Trading
Once the simulation is active:
- Students see **"Connected to simulation"** in their dashboard
- Live candlestick charts appear on the **Chart** page
- Order book depth populates on the **Order Book** page
- Students can place **Market**, **Limit**, or **Stop** orders from the **Trade** page

#### Multi-User Lab Setup
For a classroom with 1 admin + N students:
- **Admin**: Use Chrome Profile 1 (or normal window)
- **Student 1**: Use Chrome Profile 2 (or incognito)
- **Student 2**: Use Chrome Profile 3
- **Student N**: Each in a separate profile/incognito window

Each browser profile maintains an independent session. The WebSocket singleton ensures each tab uses exactly **one** connection regardless of how many components (Chart, OrderBook, OrderEntry) are active.

---

### Data Preparation

```bash
cd simtrader-tools

# Convert Bloomberg data to SimTrader CSV
python bloomberg_to_simtrader.py \
  --input-dir ./raw \
  --output simulation_2026_04_01.csv \
  --date 2026-04-01

# Validate the output
python validate_simtrader_csv.py simulation_2026_04_01.csv
```

Upload the validated CSV through the admin panel to create a new simulation.

---

## 🔐 Security Features

- **Short-lived access tokens** — 15-minute expiry minimizes exposure if stolen
- **Refresh token rotation** — Single-use tokens prevent replay attacks
- **Hashed refresh tokens** — SHA-256 hashes stored, raw tokens never touch DB
- **bcrypt password hashing** — Cost factor 12 for deliberate slowness
- **Vague error messages** — Login errors don't reveal if email exists
- **Silent password resets** — Always returns 200, doesn't leak email registration status
- **Instant session revocation** — Blocking a user immediately invalidates all active sessions
- **Invite-only registration** — Admin-controlled student onboarding

---

## 📊 API Endpoints

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Student/admin login |
| `POST` | `/api/auth/register` | None | Complete registration (invite link) |
| `POST` | `/api/auth/refresh` | None | Get new access token |
| `POST` | `/api/auth/logout` | None | Revoke refresh token |
| `POST` | `/api/auth/forgot-password` | None | Send reset email |
| `POST` | `/api/auth/reset-password` | None | Set new password |

### User Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/me` | Student/Admin | Get own profile |
| `PUT` | `/api/me` | Student/Admin | Update name |
| `PUT` | `/api/me/password` | Student/Admin | Change password |
| `GET` | `/api/admin/users` | Admin only | List all users |
| `POST` | `/api/admin/users/invite` | Admin only | Invite a student |
| `GET` | `/api/admin/users/:id` | Admin only | Get user details |
| `POST` | `/api/admin/users/:id/block` | Admin only | Block student |
| `POST` | `/api/admin/users/:id/unblock` | Admin only | Unblock student |

### Health Check

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | None | Health check (for UptimeRobot) |

---

## 🗄️ Project Structure

### Backend (`simtrader/`)

```
simtrader/
├── cmd/
│   └── server/
│       └── main.go              ← Entry point
├── internal/
│   ├── auth/                    ← Authentication module
│   │   ├── service.go           ← Login, JWT, invites, password reset
│   │   ├── handler.go           ← HTTP handlers for /api/auth/*
│   │   └── mailer.go            ← Email sending (SMTP + NoOp)
│   ├── user/                    ← User management module
│   │   ├── model.go             ← User struct + PublicProfile
│   │   ├── repository.go        ← Database queries
│   │   └── handler.go           ← HTTP handlers
│   ├── middleware/
│   │   └── auth.go              ← RequireAuth + RequireRole
│   ├── config/
│   │   └── config.go            ← Environment variable loading
│   ├── db/
│   │   └── db.go                ← PostgreSQL connection pool
│   ├── simulation/              ← Simulation management
│   ├── order/                   ← Order processing
│   ├── portfolio/               ← Portfolio tracking
│   └── types/                   ← Shared type definitions
├── migrations/
│   └── 001_create_users.sql     ← Database schema + seed admin
├── scripts/
│   └── hash_password.go         ← bcrypt hash generator
├── .env.example
├── go.mod
├── Makefile                     ← make run/build/migrate/hash
└── README.md
```

### Frontend (`simtrader-frontend/`)

```
simtrader-frontend/
├── src/
│   ├── main.tsx                 ← React entry point
│   ├── App.tsx                  ← Router + QueryClient setup
│   ├── api/
│   │   ├── client.ts            ← Axios HTTP client
│   │   └── index.ts             ← Typed API functions
│   ├── store/
│   │   └── auth.ts              ← Zustand auth store (localStorage)
│   ├── hooks/
│   │   └── useSimulationSocket.ts  ← WebSocket hook for ticks
│   ├── components/
│   │   ├── ui/                  ← Design system components
│   │   │   └── index.tsx        ← Button, Input, Card, Badge, etc.
│   │   ├── layout/
│   │   │   └── DashboardLayout.tsx
│   │   └── auth/
│   │       └── RequireAuth.tsx  ← Route guard
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── LoginPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   └── ForgotPasswordPage.tsx
│   │   └── student/
│   │       ├── PortfolioPage.tsx
│   │       ├── OrderEntryPage.tsx
│   │       ├── ChartPage.tsx
│   │       ├── OrderBookPage.tsx
│   │       ├── OrdersPage.tsx
│   │       └── ProfilePage.tsx
│   ├── types/
│   │   └── index.ts             ← TypeScript interfaces
│   └── index.css                ← Global styles
├── vite.config.ts               ← Vite config (proxy to :8080)
├── tailwind.config.js           ← Tailwind CSS (institutional design tokens)
├── tsconfig.json
├── package.json
└── .env.example
```

### Tools (`simtrader-tools/`)

```
simtrader-tools/
├── raw/                         ← Bloomberg text files (one per stock)
├── bloomberg_to_simtrader.py    ← Bloomberg → SimTrader converter
├── validate_simtrader_csv.py    ← CSV validation script
├── simulation_results.csv       ← Example output
├── AAPL.csv                     ← Example CSV
└── README.md                    ← Complete setup guide
```

---

## 🎨 Frontend Design System

The frontend features a professional, institutional-grade UI component library:

**Components:**
- **Button** — Variants: primary, secondary, ghost, danger; sizes: sm, md, lg
- **Input** — With label, error, hint, left/right icons
- **Card** — Configurable padding
- **Badge** — Variants: default, success, danger, warning, accent, neutral
- **StatCard** — Key-value display with optional delta (green/red)
- **EmptyState** — No-data placeholder
- **Alert** — Error, warning, success messages
- **Spinner** — Animated loading indicator

**Color Palette:**
- **Accent:** Blue (#1A5CFF) for primary actions
- **Success:** Green (#0D7A4E)
- **Danger:** Red (#C8291A)
- **Warning:** Amber (#B45309)
- **Bid/Ask:** Green/Red for market data

**Typography:**
- Sans-serif: Geist
- Mono: Geist Mono
- Display: Instrument Serif

---

## 🌐 Deployment

### Backend (Railway)

1. Create a new Railway project
2. Add a PostgreSQL service (Railway auto-provides `DATABASE_URL`)
3. Connect your Go service repository
4. Set all environment variables from `.env.example`
5. Railway auto-detects Go and runs `go build ./cmd/server/main.go`
6. Run migrations via Railway's psql console: `\i migrations/001_create_users.sql`
7. Monitor with UptimeRobot pinging `/health` endpoint

### Frontend (Any Static Host)

Build the production bundle:
```bash
npm run build
```

Deploy the `dist/` folder to:
- Vercel, Netlify, Cloudflare Pages, or any CDN
- Set `VITE_API_URL` to your backend URL
- Set `VITE_WS_URL` to your backend WebSocket URL

---

## 🛠️ Development Commands

### Backend

```bash
make run          # Start dev server
make build        # Compile binary to ./bin/server
make migrate      # Run database migrations
make hash p=xxx   # Generate bcrypt hash for password
make tidy         # Download and tidy dependencies
make lint         # Run go vet (static analysis)
make clean        # Remove compiled binary
```

### Frontend

```bash
npm run dev       # Start Vite dev server (:5173)
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

### Data Tools

```bash
# Convert Bloomberg data
python bloomberg_to_simtrader.py --input-dir ./raw --output sim.csv --date 2026-04-01

# Validate CSV
python validate_simtrader_csv.py sim.csv
```

---

## 📚 Choosing Simulation Dates

Select dates that create valuable teaching moments:

| Date Type | Market Behavior | Teaching Use |
|-----------|----------------|--------------|
| **Normal day** | Clean, predictable | Introductory sessions |
| **Earnings announcement** | One stock moves sharply | Event-driven trading |
| **Market-wide selloff** | All stocks fall | Portfolio risk management |
| **High volatility** (KSE-100 swings >1%) | Sharp price movements | Stop-loss lessons |
| **Low volatility** | Flat price action | Limit order patience |

Prepare multiple simulation files for different scenarios and switch between them in the admin panel.

---

## 🔧 Configuration

### Backend Environment Variables (`.env`)

```env
# Server
PORT=8080
ENV=development   # development | production

# Database
DATABASE_URL=postgresql://user:password@host:5432/simtrader?sslmode=require

# JWT Secrets (generate with: openssl rand -hex 64)
JWT_ACCESS_SECRET=replace_with_64_byte_random_hex
JWT_REFRESH_SECRET=replace_with_different_64_byte_random_hex

# Token Expiry
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Email (leave blank for local dev — prints to console)
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=your_resend_api_key
EMAIL_FROM=noreply@yourdomain.com

# Frontend URL (for CORS and email links)
FRONTEND_URL=http://localhost:5173
```

### Frontend Environment Variables (`.env`)

```env
VITE_API_URL=               # API base URL (blank in dev; proxy handles it)
VITE_WS_URL=ws://localhost:8080  # WebSocket URL for simulation ticks
```

---

## 🧪 Testing

*(Coming soon — test coverage is planned for future releases)*

---

## 🐛 Troubleshooting

### WebSocket "Insufficient resources" Error
**Symptom:** Browser console shows `WebSocket connection failed: Insufficient resources` with repeated reconnection attempts.

**Cause:** Multiple components (Chart, OrderBook, OrderEntry) each opened separate WebSocket connections to the same simulation, exhausting the browser's connection limit.

**Solution:** The frontend uses a **singleton WebSocket pool** — only one connection per simulation is created per browser tab, shared across all components.

### Blank Page on `npm run dev`
**Symptom:** The dev server starts but the browser shows a blank white page.

**Cause:** TypeScript compilation errors prevent Vite from serving the app.

**Solution:**
```bash
cd simtrader-frontend
npm run build   # Shows compilation errors
```
Fix the reported errors and restart the dev server.

### Invite Token Not Received
**Symptom:** After inviting a student, no email arrives.

**Cause:** In development mode, emails are **not sent**. The invite token is printed to the **Go backend terminal console**.

**Solution:** Check the terminal where `go run ./cmd/server/main.go` is running. Look for:
```
[DEV EMAIL] Invite to student@example.com → token: <64-char-hex-token>
```
The token is a random 64-character hex string. Use it in the registration URL:
```
http://localhost:5173/register?token=<TOKEN>
```

### 404 Not Found on Admin Endpoints
**Symptom:** Admin panel shows 404 errors for user management or simulation control endpoints.

**Cause:** Frontend API client was calling wrong endpoints (missing `/admin/` prefix).

**Correct endpoint prefixes:**
- Admin user management: `POST /api/admin/users/invite`, `GET /api/admin/users`
- Admin simulation control: `POST /api/admin/simulations/:id/start`, `pause`, `resume`, `restart`, `complete`
- User profile: `PUT /api/me`, `PUT /api/me/password`

**Solution:** Ensure frontend is rebuilt after any API route changes:
```bash
cd simtrader-frontend
npm run build
```

### Simulation Shows "Connecting..."
**Symptom:** Student dashboard shows "Connecting to simulation…" indefinitely.

**Check these:**
1. **Backend is running** on `:8080` — check `http://localhost:8080/health`
2. **Simulation is active** — Admin must start the simulation first
3. **Student is logged in** — WebSocket requires a valid auth token
4. **Backend logs show `[clock] started`** — If not, no CSV was uploaded
5. **Check Go terminal for `[ws] user=... connected`** — If missing, WebSocket upgrade failed

### Simulation Controls Unresponsive (Pause/Restart/Start)
**Symptom:** Clicking Start/Pause/Restart buttons does nothing. The status stays the same.

**Cause:** Frontend was calling `/api/simulations/:id/start` instead of `/api/admin/simulations/:id/start`.

**Solution:** All admin simulation control endpoints require the `/admin/` prefix. Fixed and rebuilt.

---

## 📝 Development Log

### Session: 2025-04-14 — WebSocket + Admin Routes Fix

**Issues Fixed:**

1. **Blank page on `npm run dev`** — 87 TypeScript compilation errors from missing API client modules
   - Created `authApi`, `simulationApi`, `orderApi`, `portfolioApi`, `userApi` clients
   - Fixed all import paths from `@/types` to `@/api`
   - Fixed function call signatures to match backend API

2. **WebSocket "Insufficient resources"** — Multiple WebSocket connections per tab
   - Implemented singleton WebSocket pool (`useSimulationSocket` hook)
   - Each browser tab now uses exactly 1 connection regardless of active components

3. **WebSocket connection failure (code 1006)** — `nhooyr.io/websocket` incompatible with Fiber
   - Replaced with `github.com/gofiber/contrib/websocket` (native fasthttp support)
   - WebSocket now connects directly to Go backend (not through Vite proxy)

4. **Admin endpoints returning 404** — Missing `/admin/` prefix on API routes
   - Fixed user management: `/users/*` → `/api/admin/users/*`
   - Fixed simulation control: `/simulations/:id/start` → `/api/admin/simulations/:id/start`
   - Fixed user profile: `/users/profile` → `/api/me`, `/users/change-password` → `/api/me/password`

5. **Registration flow broken** — Invite token not sent to backend
   - Fixed `RegisterPage` to pass `inviteToken` from URL query param
   - Fixed `RegisterInput` type to match backend: `{ inviteToken, firstName, lastName, password }`

6. **Admin "Invite student" not working** — Wrong endpoint
   - Fixed: `POST /users/invite` → `POST /api/admin/users/invite`

7. **Simulation controls unresponsive** — Same root cause as #4 (missing `/admin/` prefix)
   - Start, Pause, Resume, Restart, Complete now all hit correct admin endpoints

8. **Updated README** — Added:
   - Complete session workflow (admin login → invite → register → simulate)
   - Multi-user lab setup instructions (Chrome profiles)
   - Troubleshooting section for all discovered issues

**Technologies:**
- Backend: Go Fiber, `github.com/gofiber/contrib/websocket`, `bcrypt` (cost=12), SHA-256 token hashing
- Frontend: React 18, TypeScript, Vite 5, WebSocket singleton pattern
- Database: PostgreSQL 16+

---

## 🤝 Contributing

This project follows a modular architecture pattern. When adding new features:

1. **Follow existing module structure** — Each domain (auth, user, simulation, etc.) has its own directory with `model.go`, `repository.go`, `service.go`, `handler.go`
2. **Maintain consistency** — Mirror patterns used in existing modules
3. **Document thoroughly** — Update this README and add inline comments
4. **Test before merging** — Ensure all existing functionality works

### Adding New Modules

When implementing new backend modules (e.g., simulation clock), follow this pattern:

```
internal/
  simulation/
    model.go       ← Structs and domain types
    repository.go  ← Database queries
    service.go     ← Business logic, goroutines, broadcast
    handler.go     ← HTTP + WebSocket handlers
```

---

## 📝 License

MIT License — See LICENSE file for details.

---

## 🙏 Acknowledgments

- **Refinitiv by LSEG** — For PSX data access via Terminal
- **TradingView** — For lightweight-charts library
- **Go Team** — For the excellent standard library and tooling
- **React & Vite** — For modern frontend development experience

---

## 📞 Support

- **Issues:** Open a GitHub issue for bugs or feature requests
- **Questions:** Check component-specific READMEs for detailed documentation
- **Security:** Report security vulnerabilities via private email (do not open public issues)

---

<div align="center">

**Built for IBA Finance Lab - Muhammad Ali Iqbal**

[⬆ Back to Top](#simtrader--stock-market-simulation-platform)

</div>
