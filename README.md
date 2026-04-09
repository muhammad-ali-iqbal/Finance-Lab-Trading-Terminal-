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
│                  Student Browser                             │
│              simtrader-frontend (:5173)                      │
│                                                              │
│  ┌──────────┐  ┌────────┐  ┌───────┐  ┌──────────┐         │
│  │Portfolio │  │ Trading│  │ Charts│  │Order Book│         │
│  └────┬─────┘  └───┬────┘  └───┬───┘  └────┬─────┘         │
└───────┼────────────┼───────────┼─────────────┼──────────────┘
        │            │           │             │
        └────────────┴───────────┼─────────────┘
                                 │
                    HTTP REST + WebSocket API
                                 │
┌────────────────────────────────┼─────────────────────────────┐
│        simtrader Backend (:8080)                               │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │       Go Fiber HTTP Server + WebSocket Hub           │    │
│  └─────────────────────┬────────────────────────────────┘    │
│                        │                                      │
│    ┌───────────────────┼───────────────────┐                 │
│    │       Business Logic Layer            │                  │
│    │  auth │ user │ simulation │ order │ portfolio          │
│    └───────────────────┬───────────────────┘                 │
│                        │                                      │
│                 ┌──────┴──────┐                               │
│                 │ PostgreSQL  │                               │
│                 │  Database   │                               │
│                 └─────────────┘                               │
└─────────────────────────────────────────────────────────────┘
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

# Start server
make run
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

The Vite dev server proxies API requests (`/api/*`) to the backend at `:8080`, eliminating CORS issues during development.

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

- **Bloomberg LP** — For PSX data access via Terminal
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

**Built with ❤️ for financial education**

[⬆ Back to Top](#simtrader--stock-market-simulation-platform)

</div>
