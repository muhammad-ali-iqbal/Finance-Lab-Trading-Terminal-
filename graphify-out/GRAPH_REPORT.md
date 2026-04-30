# Graph Report - .  (2026-04-29)

## Corpus Check
- 68 files · ~1,515,974 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 439 nodes · 739 edges · 73 communities detected
- Extraction: 63% EXTRACTED · 37% INFERRED · 0% AMBIGUOUS · INFERRED: 274 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]

## God Nodes (most connected - your core abstractions)
1. `BadRequest()` - 33 edges
2. `InternalError()` - 29 edges
3. `Status` - 28 edges
4. `main()` - 23 edges
5. `Repository` - 23 edges
6. `Handler` - 20 edges
7. `Close()` - 19 edges
8. `Repository` - 16 edges
9. `Service` - 12 edges
10. `GetClaims()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `NewSMTPMailer()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\auth\mailer.go
- `main()` --calls--> `NewService()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\auth\service.go
- `main()` --calls--> `NewEngine()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\order\engine.go
- `main()` --calls--> `NewOrderRepository()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\order\handler.go
- `jsonErrorHandler()` --calls--> `Status`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\user\model.go

## Hyperedges (group relationships)
- **Student Trading Flow (Order â†’ Portfolio â†’ P&L)** — claudemd_order_module, claudemd_portfolio_module, claudemd_simulation_clock [INFERRED 0.85]
- **Bloomberg PSX Data Ingestion Pipeline** — aapltxt_bloomberg_ohlcv_data, claudemd_bloomberg_csv_tools, claudemd_simulation_module [INFERRED 0.82]
- **Real-time Trading System Components** — CLAUDE_SimulationClock, CLAUDE_OrderFillEngine, CLAUDE_WebSocketRealtime [EXTRACTED 1.00]
- **Authentication and Security System** — CLAUDE_JWTAuth, CLAUDE_PasswordHashing, CLAUDE_InviteOnlyRegistration [EXTRACTED 1.00]
- **Frontend State and Data Management** — CLAUDE_Zustand, CLAUDE_TanStackQuery, CLAUDE_WebSocketSingletonPool [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (16): Handler, Mailer, NoOpMailer, Service, TokenPair, mapAuthError(), scanUser(), generateSecureToken() (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (8): extractBearerToken(), RequireAuth(), NewClock(), TokenParser, Client, Clock, ClockRegistry, Repository

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (11): GetClaims(), RequireRole(), BadRequest(), InternalError(), Handler, Handler, Handler, Handler (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (31): db(), get_connection(), get_known_tickers(), init_db(), last_fetch_date(), log_fetch(), rows: list of dicts with keys symbol, date, open, high, low, close, volume, upsert_ohlcv() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (9): Close(), Connect(), OrderRepository, HistoryPoint, LeaderboardEntry, Portfolio, Position, Repository (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (21): detect_columns(), expand_daily_to_minutes(), forward_fill_gaps(), _in_session(), main(), parse_daily_file(), parse_datetime(), parse_intraday_file() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (24): Admin Route Prefix Convention, Go Backend Architecture, Bloomberg to SimTrader CSV Conversion Tool, Directory Structure and Project Layout, React Frontend Architecture, Go 1.22+ with Fiber v2, Insufficient Resources WebSocket Issue, Invite-Only Registration Pattern (+16 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (19): authResponse, forgotPasswordRequest, loginRequest, logoutRequest, refreshRequest, registerRequest, resetPasswordRequest, NewHandler() (+11 more)

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (17): forward_fill_gaps(), _in_session(), main(), parse_bloomberg_paste(), _parse_price(), _parse_volume(), _pkt_to_datetime(), _pkt_to_utc() (+9 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (8): handler(), contains(), containsRune(), isDuplicateError(), NewRepository(), parseCSVRow(), validateHeader(), scanFn

### Community 10 - "Community 10"
Cohesion: 0.36
Nodes (9): forward_fill(), in_session(), main(), parse_file(), parse_row_date(), pf(), pkt_to_utc(), PSO.PK.txt  →  PSO   (strips exchange suffix like .PK, .KAR) (+1 more)

### Community 11 - "Community 11"
Cohesion: 0.43
Nodes (2): NewEngine(), Engine

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (2): useTheme(), ThemeToggle()

### Community 13 - "Community 13"
Cohesion: 0.47
Nodes (2): SMTPMailer, NewSMTPMailer()

### Community 14 - "Community 14"
Cohesion: 0.6
Nodes (5): Config, getEnv(), Load(), parseDuration(), requireEnv()

### Community 15 - "Community 15"
Cohesion: 0.53
Nodes (4): getConn(), notify(), wsConnect(), wsDisconnect()

### Community 16 - "Community 16"
Cohesion: 0.47
Nodes (3): handleFileUpload(), handleReupload(), invalidate()

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (3): Simulation, Status, TickBroadcast

### Community 18 - "Community 18"
Cohesion: 0.5
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 0.83
Nodes (3): fmt(), fmtPct(), fmtPKR()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (1): End-to-end test suite for psx_tracker. Tests: DB schema, ticker loading, single-

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (2): fmt(), fmtCurrency()

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (2): AAPL Bloomberg OHLCV Raw Data (1-min bars, 2026-04-01), Bloomberg â†’ SimTrader CSV Workflow

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Portfolio Management System (Auto P&L)

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Order Management System

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): Admin Dashboard & Simulation Controls

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Real-Time WebSocket Integration

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): SimulationTimer Component

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Frontend Infrastructure (React+TS+Vite+Tailwind)

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): Authentication & User Management (Invite Flow)

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): QWEN.md â€” SimTrader Context for Qwen Code

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): SimTrader Monorepo (3-component structure)

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): Security Feature Set (short-lived tokens, rotation, bcrypt)

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): Frontend Design System (Button, Card, Badge, StatCard)

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): Admin+Student Session Workflow

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): Railway Deployment (Backend)

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): Role-Based Access Control (Admin/Student)

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): Module Pattern (modelâ†’repositoryâ†’serviceâ†’handler)

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): Mailer (SMTP + NoOp Dev Mode)

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): Database Migrations (SQL schema + seed admin)

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): PSX Session Details (09:30-15:30 PKT, 360 bars)

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): PSX Stock Teaching Categories (Large/Mid/Volatile/Defensive)

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): Light/Dark Mode Toggle UI Component

## Knowledge Gaps
- **95 isolated node(s):** `rows: list of dicts with keys symbol, date, open, high, low, close, volume`, `Direct PSX scraper — hits dps.psx.com.pk without relying on the psx package's br`, `Pull the full ticker list from PSX and persist any new ones.`, `Fetch one month of OHLCV for a single symbol via PSX HTML endpoint.`, `Fetch all months covering from_date..to_date for a single symbol.` (+90 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (2 nodes): `processPending()`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `clsx()`, `DashboardLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `handleSubmit()`, `AdminSettingsPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `handleSubmit()`, `LoginPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `fmt()`, `ChartPageold.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `fmt()`, `OrderBookPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `fmt()`, `OrdersPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `AAPL Bloomberg OHLCV Raw Data (1-min bars, 2026-04-01)`, `Bloomberg â†’ SimTrader CSV Workflow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `gemma.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `config.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `adapter.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `order.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `portfolio.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `simulation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `user.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `AdminLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `AdminOverviewPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `ProfilePage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Portfolio Management System (Auto P&L)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Order Management System`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `Admin Dashboard & Simulation Controls`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Real-Time WebSocket Integration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `SimulationTimer Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Frontend Infrastructure (React+TS+Vite+Tailwind)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `Authentication & User Management (Invite Flow)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `QWEN.md â€” SimTrader Context for Qwen Code`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `SimTrader Monorepo (3-component structure)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `Security Feature Set (short-lived tokens, rotation, bcrypt)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `Frontend Design System (Button, Card, Badge, StatCard)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `Admin+Student Session Workflow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `Railway Deployment (Backend)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `Role-Based Access Control (Admin/Student)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `Module Pattern (modelâ†’repositoryâ†’serviceâ†’handler)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `Mailer (SMTP + NoOp Dev Mode)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `Database Migrations (SQL schema + seed admin)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `PSX Session Details (09:30-15:30 PKT, 360 bars)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `PSX Stock Teaching Categories (Large/Mid/Volatile/Defensive)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `Light/Dark Mode Toggle UI Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 4`, `Community 7`, `Community 9`, `Community 11`, `Community 13`, `Community 14`, `Community 15`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **Why does `Status` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Why does `Close()` connect `Community 4` to `Community 0`, `Community 1`, `Community 2`, `Community 3`, `Community 11`, `Community 15`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Are the 32 inferred relationships involving `BadRequest()` (e.g. with `.Login()` and `.CompleteRegistration()`) actually correct?**
  _`BadRequest()` has 32 INFERRED edges - model-reasoned connections that need verification._
- **Are the 28 inferred relationships involving `InternalError()` (e.g. with `Status` and `.SubmitOrder()`) actually correct?**
  _`InternalError()` has 28 INFERRED edges - model-reasoned connections that need verification._
- **Are the 27 inferred relationships involving `Status` (e.g. with `main()` and `jsonErrorHandler()`) actually correct?**
  _`Status` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `main()` (e.g. with `.run()` and `init_db()`) actually correct?**
  _`main()` has 20 INFERRED edges - model-reasoned connections that need verification._