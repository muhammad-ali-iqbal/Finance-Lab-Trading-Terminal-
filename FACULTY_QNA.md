# SimTrader — Faculty Q&A

> Anticipated questions for the joint Finance / Computer Science faculty presentation.
> Sections are tagged **[F]** for finance-leaning questions, **[CS]** for technical, and **[★]** for cross-disciplinary.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Pedagogical Design — for Finance Faculty](#2-pedagogical-design)
3. [Market Realism & Data](#3-market-realism--data)
4. [Technical Architecture — for CS Faculty](#4-technical-architecture)
5. [Security & Access Control](#5-security--access-control)
6. [Operations, Deployment & Cost](#6-operations-deployment--cost)
7. [Roadmap & Future Work](#7-roadmap--future-work)
8. [Demo Walkthrough Script](#8-demo-walkthrough-script)

---

## 1. Project Overview

### Q: What is SimTrader in one sentence?  **[★]**
A full-stack, classroom-grade equity trading simulator that replays historical Pakistan Stock Exchange (PSX) sessions in accelerated time, lets students place real orders against the replayed tape, and gives instructors full control over session timing, participants, and scenarios.

### Q: Who built it and why?  **[★]**
Built in-house at IBA's Finance Lab to fill the gap between:
- **Toy paper-trading apps** (no realism, no Pakistan-specific data, no instructor control), and
- **Bloomberg / commercial platforms** (prohibitively expensive per seat, generic global focus, no classroom orchestration).

The goal is to give finance students hands-on practice with the *Pakistani* market — the same tickers, the same session hours, the same volatility patterns — without paying per-seat licensing.

### Q: What's the current scope?  **[★]**
Three integrated subsystems:
1. **`simtrader/`** — Go backend (simulation engine, order book, portfolio, auth, WebSocket).
2. **`simtrader-frontend/`** — React student & admin SPA (trade, charts, leaderboard, controls).
3. **`psx_tracker/`** — Python service that fetches PSX end-of-day OHLCV daily and stores it in a local SQLite DB. Feeds the simulation's data layer.
4. **`simtrader-tools/`** — Python scripts that convert PSX intraday exports into the SimTrader CSV format that the simulation engine ingests.

---

## 2. Pedagogical Design

### Q: What learning outcomes does this enable?  **[F]**
- **Order types & execution mechanics** — students experience the difference between market and limit orders firsthand.
- **Position sizing & risk management** — fixed starting capital forces real allocation decisions.
- **Technical analysis** — six built-in indicators (SMA, EMA, Bollinger Bands, RSI, MACD) let students apply textbook theory to live charts.
- **Behavioral finance** — students see (and feel) their own panic selling and FOMO buying in a low-stakes setting.
- **Market microstructure** — orderbook depth view exposes bid/ask spread dynamics.
- **Portfolio analytics** — P&L attribution, position-level returns, mark-to-market tracking.

### Q: How is this different from existing tools like Stock-Trak, Investopedia Simulator, or MarketWatch Game?  **[F]**
| Feature | SimTrader | Commercial Sim Games |
|---------|-----------|---------------------|
| **PSX coverage** | All 1,035+ tickers | Usually NYSE/NASDAQ only |
| **Time compression** | Configurable (a 6-hour session in 6 min) | Real-time only |
| **Instructor control** | Pause / restart / replay scenarios | None |
| **Order matching** | Realistic fill engine on real historical ticks | Often delayed-quote with synthetic fills |
| **Per-seat cost** | $0 (self-hosted) | $5–25/student/semester |
| **Customization** | Full source code | Closed |
| **Replay same day** | Yes (deterministic) | No |

### Q: Can it be used for graded assignments?  **[F]**
Yes. Every order, fill, position change, and portfolio snapshot is persisted in PostgreSQL with timestamps. Possible assessment patterns:
- **Best Sharpe ratio** across a session
- **Risk-adjusted return** vs. KSE-100 benchmark
- **Strategy adherence** (e.g., "use only limit orders" — graded by audit log)
- **Reflection journals** keyed to specific fills
- Class-wide leaderboard with anonymized rankings

Data export to CSV is straightforward — instructors can pull all student activity for any session.

### Q: What order types are supported?  **[F]**
- **Market orders** — fill at next available tick price
- **Limit orders** — fill only when bid/ask crosses the limit
- **Order cancellation** — pending limit orders can be canceled before fill

*Planned for v2:* stop-loss, stop-limit, GTC.

### Q: Does it model transaction costs?  **[F]**
Not yet. This is a conscious early-version decision — we wanted students to focus on entry/exit timing before layering on cost. v2 will add configurable commission and PSX-specific CDC charges; instructors can toggle per-session.

### Q: Can students short-sell?  **[F]**
Not in v1. PSX retail short-selling is restricted in reality (only Securities Lending and Borrowing — SLB — facilities allow it), so omitting shorts is faithful to the Pakistani retail experience. Long-only with cash positions only.

### Q: How long is a typical simulation session?  **[F]**
Flexible. The speed multiplier is configurable:
- **Speed = 1** — real-time (6-hour PSX session = 6 hours of class)
- **Speed = 60** — 1 wall-second per simulated minute (6 hours of market in 6 minutes)
- **Speed = 10** — 1 wall-second per 10 simulated seconds (good for a 90-min lab)

Instructors pick what fits the class period.

### Q: Can the same day be replayed?  **[F]**
Yes. The simulation engine reads from a deterministic CSV of price ticks, so two runs on the same data produce identical price action. Students see the same volatility patterns — but their orders, of course, will fill differently based on their decisions.

### Q: Do you simulate dividends, splits, or corporate actions?  **[F]**
Not in v1. Sessions are single-day intraday replays where these are not relevant. Multi-day sessions with corporate-action modeling is a v3 item.

---

## 3. Market Realism & Data

### Q: Where does the price data come from?  **[★]**
Two pipelines:
1. **`psx_tracker/`** — Scrapes `dps.psx.com.pk/historical` daily for EOD OHLCV across all ~1,035 PSX tickers. Stores in SQLite. This is our long-term archive.
2. **`simtrader-tools/psx_to_simtrader.py`** — Converts tab-separated PSX intraday exports (1-minute bars) into the simulation engine's CSV format. This is what powers individual classroom sessions.

The `psx-data-reader` Python package's `stocks()` function broke in 2024 when PSX renamed an HTML column (`TIME` → `DATE`), so we scrape the underlying HTTP endpoint directly.

### Q: Why historical replay instead of paper-trading live markets?  **[F]**
Three reasons:
1. **Time compression** — you can replay a full trading day in 6 minutes. A live market session takes 6 hours.
2. **Reproducibility** — every class running the same scenario sees the same volatility, which makes graded comparisons fair.
3. **Curated scenarios** — instructors can choose an earnings-day, a market-crash day, or a quiet day to teach specific lessons. Live markets don't let you pick.

### Q: How realistic are the fills?  **[F]**
Reasonably so for an educational platform, with documented compromises:
- **Market orders** fill at the next tick's OHLC range (we use close as the fill price, which is conservative but defensible).
- **Limit orders** fill when a tick's high (for buys) or low (for sells) crosses the limit price.
- **No slippage model** in v1 — students get clean fills at quoted prices. v2 will add a configurable slippage model.
- **No bid-ask spread** — we use single-price ticks. v2 will optionally simulate spread by widening fills against the trader.

### Q: How current is the PSX data the tracker pulls?  **[★]**
The `psx_tracker/` scheduler fetches **end-of-day** (T+0 close) data every day at 16:00 PKT, after PSX closes at 15:30. Data starts from project inception (2026-04-29). Intraday data for simulations is exported manually from a data provider on demand — we don't store intraday in the long-term archive.

### Q: Does it track KSE-100?  **[F]**
Not as a first-class entity in v1. Students see individual tickers. The KSE-100 index can be added as a "synthetic ticker" by including KSE-100 OHLCV in the session CSV — its index value would just appear alongside stocks.

---

## 4. Technical Architecture

### Q: Why Go for the backend?  **[CS]**
- **Concurrency primitives** — the simulation engine needs to broadcast price ticks to many WebSocket clients while running an order-matching engine. Goroutines and channels make this idiomatic.
- **Single binary deployment** — no Python runtime, no JVM, no virtualenv. Build once, scp to a server, run.
- **Performance** — handles thousands of concurrent WebSocket connections per machine without breaking a sweat.
- **Type safety** — catches whole classes of bugs at compile time, important for financial logic.

### Q: Why Fiber over `net/http` or Gin?  **[CS]**
Fiber sits on top of `fasthttp` and has Express-like ergonomics that the team was already familiar with. The performance edge is marginal vs Gin, but the API surface is cleaner. We had one painful incident migrating WebSockets from `nhooyr/websocket` to `gofiber/contrib/websocket` because the Fiber request context isn't compatible with stock `net/http` upgraders — documented in our session logs.

### Q: How does the simulation clock work?  **[CS]**
- **One goroutine per active simulation.**
- The goroutine reads price ticks from PostgreSQL ordered by `timestamp`.
- It waits `1 / speedMultiplier` wall-seconds between simulated minutes.
- On each tick, it (a) broadcasts to all subscribed WebSocket clients, (b) synchronously runs the order-matching engine against pending limit orders, (c) updates portfolio mark-to-market values, (d) persists `current_sim_time` to the DB for crash recovery.
- On pause, the goroutine sleeps on a channel; resume sends to the channel.

### Q: What's the fill-engine algorithm?  **[CS]**
On each tick `t` for symbol `s`:
1. Query all pending orders for symbol `s` across all participants.
2. For market orders: fill at `t.close`. Quantity is unlimited (educational simplification; v2 will model available liquidity from `t.volume`).
3. For limit BUY: if `t.low <= limit_price`, fill at `min(limit_price, t.open)`.
4. For limit SELL: if `t.high >= limit_price`, fill at `max(limit_price, t.open)`.
5. Insert a `fill` row, update the participant's position, deduct/credit cash.
6. Mark-to-market the portfolio at `t.close`.

All in a single DB transaction per tick.

### Q: How do you handle concurrent WebSocket connections?  **[CS]**
The simulation engine maintains an in-memory hub: `map[simulationID]map[clientID]*websocket.Conn`. On a tick, the goroutine iterates and writes to each. A separate goroutine per client reads heartbeat / control messages.

On the frontend, we hit an unexpected issue: React's StrictMode + multiple components mounting (Chart, OrderBook, OrderEntry) was creating 3+ WebSocket connections per tab, exhausting browser socket limits. We solved this with a **singleton WebSocket pool** keyed by simulation ID — one connection per (tab, simulation), shared across all subscribing components via React context. See `simtrader-frontend/src/hooks/useSimulationSocket.ts`.

### Q: Why React + TypeScript on the frontend?  **[CS]**
- React is the dominant SPA framework — easy for new contributors.
- TypeScript catches half the bugs before they ship; for a financial app this is non-negotiable.
- We use **TanStack Query** for server state (data fetching, cache invalidation, optimistic updates) and **Zustand** for local UI state (auth, theme). Avoids the Redux boilerplate while staying explicit.

### Q: Why TradingView lightweight-charts?  **[CS]**
- Free, MIT-licensed, ~50 KB minified.
- Familiar candlestick UI for finance students.
- Drawback: no built-in technical indicators. We wrote our own indicator math in `simtrader-frontend/src/utils/indicators.ts` (SMA, EMA, Bollinger Bands, RSI, MACD).
- **Future:** we're applying for access to TradingView's **Advanced Charting Library**, which has 100+ built-in indicators, drawing tools, multiple chart types, and a built-in replay mode — all free under their attribution requirement. The library distribution is gated via approved GitHub access.

### Q: Why PostgreSQL for the main app and SQLite for the tracker?  **[CS]**
- **PostgreSQL** in the main app — concurrent writes from multiple users, transactional integrity for fills/positions, mature horizontal-scaling story if we ever need it.
- **SQLite** in `psx_tracker` — single-process, write-once-daily, no users, ~5 MB of data. PostgreSQL would be over-engineering. SQLite gives us a single-file database that's easy to back up (just `cp`).

### Q: How is authentication implemented?  **[CS]**
- **bcrypt** (cost factor 12) for password hashing.
- **JWT access tokens** (short-lived, 15 min) + **refresh tokens** (long-lived, 7 days, single-use rotation).
- Refresh tokens are SHA-256 hashed in the DB; rotating on every refresh invalidates the previous one. This means a leaked refresh token is single-use.
- **Invite-only student registration** — admin invites generate a 32-byte random token (SHA-256 hashed in DB). Token must be presented to complete account setup.
- **JWT middleware** (`RequireAuth`) on protected routes; **role middleware** (`RequireRole("admin")`) on admin routes.

### Q: How do you prevent SQL injection / XSS?  **[CS]**
- All DB access through Go's `database/sql` package with parameterized queries — no string interpolation.
- React escapes interpolated values by default, so XSS is mostly a non-issue unless someone uses `dangerouslySetInnerHTML` (we don't).
- We set `Content-Security-Policy` headers and `X-Frame-Options: DENY` on the backend.

### Q: What's the test strategy?  **[CS]**
Currently:
- Unit tests for the order matching engine (deterministic, easy to test).
- Unit tests for portfolio P&L calculations.
- Manual integration testing for WebSocket and clock behavior — these are harder to test in isolation.

Gaps we're aware of:
- No end-to-end tests yet (Playwright on the roadmap).
- No load tests; we know the architecture supports many users but haven't quantified it.

### Q: How big is the codebase?  **[CS]**
- Backend (Go): ~4,500 LOC across the `internal/` packages.
- Frontend (React/TS): ~6,000 LOC.
- Python tools: ~600 LOC.
- All version-controlled, single repo (monorepo).

---

## 5. Security & Access Control

### Q: How do students get accounts?  **[CS]**
Strictly invite-only. The admin (instructor) enters an email address in the admin panel → backend generates a one-time invite token → emails the student a registration link with the token. The student completes registration (first name, last name, password) by submitting the token along with their details. No public sign-up form exists.

In dev mode the token is printed to the backend console instead of emailed.

### Q: Can students see each other's portfolios or orders?  **[F][CS]**
No. Each student's portfolio and order history is scoped by `user_id` and enforced at the API layer. The admin (instructor) can see all participants' data — that's necessary for grading.

A **leaderboard view** is on the roadmap that will show ranked anonymized P&L (e.g., "User #4 — +12.3%") without exposing identities until the instructor reveals them post-session.

### Q: What happens if an instructor's account is compromised?  **[CS]**
- Refresh tokens are revocable from the admin Settings page.
- All admin actions are logged (insert/update on `audit_log`).
- Password reset requires email confirmation.
- Multi-admin setups are supported, so a compromised account can be blocked by another admin.

### Q: Where are passwords stored?  **[F][CS]**
We never store passwords. Only bcrypt hashes (cost factor 12 — meaning ~250ms per verification on modern hardware, deliberately expensive to make brute-forcing infeasible). Bcrypt also salts each hash, so two students with the same password produce different hashes.

### Q: PII concerns for student data?  **[F][CS]**
We store: name, email, hashed password, and trading activity. No financial PII (no real money, no real bank accounts). All data is local to the IBA server. No third-party analytics, no tracking pixels.

---

## 6. Operations, Deployment & Cost

### Q: What's the cost to run?  **[F][CS]**
- **Software:** $0 (all dependencies are open-source).
- **Server:** A single $5–10/month VPS handles a classroom of 50 students comfortably.
- **TradingView library:** $0 (free under attribution requirement).
- **PSX data:** $0 (scraped from public endpoints; we respect rate limits with 2-second batch delays).
- **Total per-student cost:** ~$0.20/student/semester at scale.

### Q: How is it deployed?  **[CS]**
Current dev setup:
- Backend: `go run ./cmd/server/main.go` on port 8080.
- Frontend: Vite dev server on port 5173, proxying `/api` to the backend.

Production plan:
- Backend binary built and run as a systemd service.
- Frontend built (`vite build`) and served as static files from nginx.
- nginx terminates TLS and proxies `/api` and `/ws` to Go.
- PostgreSQL on the same box (small classroom scale) or a managed service for production.

### Q: How does crash recovery work?  **[CS]**
The simulation clock persists `current_sim_time` to the `simulations` table on every tick. On server restart, the resume path picks up from the last persisted time — at most one minute of simulated time is replayed. Orders and fills are in the DB and committed per-tick, so no fill is ever lost.

### Q: How many concurrent users does it support?  **[CS]**
Architecture supports many thousands — Go WebSocket connections are cheap (~5 KB per connection). The bottleneck is the order-matching engine's per-tick database transaction. Profile-driven estimate: ~500 simultaneous traders per server before we'd need to shard.

We haven't load-tested at scale yet — that's on the roadmap before any large rollout.

### Q: Is it open source?  **[F][CS]**
Currently a private IBA repository. We're discussing an MIT-licensed open-source release after the v2 features land, so other South Asian universities can use it.

---

## 7. Roadmap & Future Work

### v1 (current — shipped)
- Simulation engine with configurable speed
- Market & limit orders, cancellation
- Real-time WebSocket price feed
- Portfolio P&L, positions, order history
- TradingView lightweight-charts with 6 technical indicators (SMA, EMA, BB, RSI, MACD)
- Admin panel: create/start/pause/restart simulations, invite users
- Light / dark theme

### v2 (next quarter)
- **TradingView Advanced Charting Library integration** — 100+ indicators, drawing tools, replay mode
- **Stop-loss & stop-limit orders**
- **Transaction costs** (configurable PSX commission + CDC charges)
- **Slippage model** for market orders
- **Leaderboard view** with anonymized rankings
- **CSV export** of student activity for grading
- **End-to-end Playwright tests**

### v3 (longer-term)
- **Multi-day sessions** with corporate action modeling (dividends, splits)
- **Mobile-responsive UI** for tablet usage in class
- **KSE-100 index** as a first-class entity with sector breakdowns
- **Margin / SLB modeling** for advanced finance courses
- **Bot opponents** — algorithmic traders that students compete against

### Research / open questions
- Whether to model order book depth (currently single-price ticks).
- Whether to integrate live PSX data for after-hours practice.
- Comparing student performance pre/post-SimTrader exposure as a published study.

---

## 8. Demo Walkthrough Script

A suggested 10-minute live demo flow for the presentation:

1. **(1 min) Admin overview** — Log in as admin. Show the Simulations list, click "New simulation."
2. **(1 min) Upload data** — Show a pre-made CSV (`simulation.csv`), upload, the system parses & confirms "Loaded 3 symbols, 1,080 ticks."
3. **(1 min) Invite a student** — Enter `demo-student@iba.edu.pk`, show the token in the console output, complete student registration in a second browser profile.
4. **(2 min) Start simulation at speed 60** — admin clicks Start. Show the WebSocket "Live" indicator turn green in the student's chart. Watch a candle build in real-time.
5. **(2 min) Place orders** — Student places a market BUY for PSO. Show the fill appear in Orders. Place a limit BUY at $5 below current price; show it sitting in the order book.
6. **(1 min) Indicators** — Toggle on SMA(20), Bollinger Bands, RSI. Show indicators rendering live.
7. **(1 min) Pause / Restart** — Admin pauses. Discuss how this enables in-class discussion. Restart from the beginning, show same price action replays.
8. **(1 min) Portfolio view** — Show student's portfolio: open positions, unrealized P&L, total return. Q&A.

---

## Appendix A — One-paragraph elevator pitch

> SimTrader is an open-source, self-hosted trading simulation platform built at IBA for finance classrooms. It replays historical Pakistan Stock Exchange sessions in accelerated time and lets students practice real trading mechanics — market orders, limit orders, technical analysis, portfolio management — using actual PSX tickers, without per-seat licensing costs. Instructors create scenarios from any historical PSX trading day, invite students, and orchestrate the session in real time: starting, pausing, replaying. Every order and fill is auditable for grading.

## Appendix B — Likely tough questions and short answers

| Q | Short answer |
|---|--------------|
| "Why not just give students a Bloomberg login?" | $24K/seat/year. Not feasible at scale. |
| "How do you know the fills are realistic?" | They're not perfect — but they're deterministic and pedagogically defensible. v2 adds slippage. |
| "What if a student exploits a bug to get infinite money?" | Audit log captures all transactions. Instructor can reset. |
| "Why Pakistan-specific?" | Local students benefit most from familiar tickers (HBL, ENGRO, LUCK) rather than abstract foreign names. |
| "Is this peer-reviewed?" | Not yet. Comparative-performance study is on the v3 roadmap. |
| "Who maintains it after the original team graduates?" | Documented codebase (`CLAUDE.md` in each module), open-source license planned. |
| "Can I use it for my own course?" | Yes — that's the goal. Talk to the lab after the presentation. |
