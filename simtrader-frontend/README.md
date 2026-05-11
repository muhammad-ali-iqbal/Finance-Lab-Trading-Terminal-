# SimTrader Frontend

React + TypeScript SPA for the SimTrader educational trading platform. Connects to the Go backend at `:8080` via Axios (REST) and WebSocket.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| npm | 9+ |

---

## Daily Startup

```cmd
cd simtrader-frontend
npm run dev
```

Vite dev server starts at **http://localhost:5173**. All `/api` requests are proxied to `http://localhost:8080` — the backend must be running.

For classroom demos where students connect from other machines, start with your LAN IP exposed:

```cmd
npm run dev -- --host
```

---

## First-Time Setup

```cmd
cd simtrader-frontend
npm install
```

No other configuration needed — the backend URL is set via Vite's proxy in `vite.config.ts`.

---

## Build for Production

```cmd
npm run build
```

Output goes to `dist/`. Serve it with any static file server pointed at `dist/`, with the backend accessible at `/api`.

---

## Tech Stack

| Layer | Library |
|-------|---------|
| Framework | React 18 + TypeScript 5.5 |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router v6 |
| Data fetching | TanStack React Query v5 |
| Auth state | Zustand |
| HTTP client | Axios (with token refresh interceptor) |
| Charts | TradingView lightweight-charts v4 |
| Icons | Lucide React |

---

## Project Structure

```
src/
├── api/                  ← API client modules + shared types
│   ├── auth.ts           ← login, register, password reset
│   ├── simulation.ts     ← simulation CRUD + ticks
│   ├── order.ts          ← order submit, cancel, order book
│   ├── portfolio.ts      ← portfolio + positions
│   ├── challenge.ts      ← challenges, orders, leaderboard, EOD chart data
│   ├── user.ts           ← admin user management
│   ├── client.ts         ← Axios instance + silent token refresh
│   └── index.ts          ← re-exports all types + clients
├── components/
│   ├── ui/index.tsx      ← design system: Button, Input, Card, Badge, Spinner
│   ├── layout/
│   │   └── DashboardLayout.tsx   ← student sidebar + nav
│   └── auth/RequireAuth.tsx      ← route guard
├── context/
│   └── ThemeContext.tsx   ← light/dark theme
├── hooks/
│   └── useSimulationSocket.ts    ← singleton WebSocket pool (one connection per sim)
├── pages/
│   ├── auth/             ← Login, Register, ForgotPassword, ResetPassword
│   ├── student/          ← Overview, Portfolio, OrderEntry, Chart, OrderBook,
│   │                        Orders, ChallengePage, ChallengeDetailPage, EODChartTab
│   └── admin/            ← AdminLayout, Overview, Simulations, Users,
│                            Challenges, Settings
├── store/
│   └── auth.ts           ← Zustand auth store (persisted to localStorage)
└── utils/
    └── indicators.ts     ← Pure-TS: SMA, EMA, Bollinger Bands, RSI, MACD
```

---

## Features

### Simulation Trading
- Live candlestick charts with WebSocket tick stream
- Technical indicators: SMA 20/50, EMA 20, Bollinger Bands, RSI 14, MACD
- Order entry (market, limit, stop) with real-time order book
- Portfolio P&L, position tracking, equity curve

### Challenges
- Semester-long paper-trading competitions using live PSX EOD data
- Portfolio tab: performance chart + positions + return metrics
- Orders tab: place and cancel orders (fill at next EOD close)
- Leaderboard tab: anonymized ranking for students, full names for admin
- Charts tab: full PSX stock universe with daily OHLCV + same 6 indicators

### Admin
- Create / activate / complete challenges
- Enroll all students, manually trigger reconciliation
- Manage simulations (upload CSV, start/pause/resume/restart)
- Invite students, block/unblock accounts

---

## Authentication Flow

1. Admin invites student → invite token printed to backend console (dev mode)
2. Student visits `/register?token=<TOKEN>` to set name + password
3. Login returns 15-minute access token + 7-day refresh token
4. Axios interceptor silently refreshes the access token on 401
5. Refresh tokens are single-use (rotated on each refresh)

---

## Notes

- The WebSocket connects directly to `:8080` — not through the Vite proxy — because browsers don't proxy WebSocket upgrade requests
- React Query caches EOD chart data for 8 hours (refreshes once per working day)
- The singleton WebSocket pool (`useSimulationSocket`) prevents multiple connections when several components mount on the same simulation page
