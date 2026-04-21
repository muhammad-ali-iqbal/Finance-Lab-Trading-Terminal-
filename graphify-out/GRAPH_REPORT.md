# Graph Report - .  (2026-04-20)

## Corpus Check
- 61 files · ~1,086,277 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 397 nodes · 656 edges · 67 communities detected
- Extraction: 63% EXTRACTED · 37% INFERRED · 0% AMBIGUOUS · INFERRED: 244 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `BadRequest()` - 31 edges
2. `Status` - 28 edges
3. `InternalError()` - 27 edges
4. `Repository` - 23 edges
5. `Handler` - 20 edges
6. `main()` - 16 edges
7. `Repository` - 16 edges
8. `Close()` - 15 edges
9. `Service` - 12 edges
10. `GetClaims()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `NewService()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\auth\service.go
- `main()` --calls--> `NewEngine()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\order\engine.go
- `jsonErrorHandler()` --calls--> `Status`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\user\model.go
- `main()` --calls--> `Connect()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\db\db.go
- `main()` --calls--> `Close()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\db\db.go

## Hyperedges (group relationships)
- **Student Trading Flow (Order â†’ Portfolio â†’ P&L)** — claudemd_order_module, claudemd_portfolio_module, claudemd_simulation_clock [INFERRED 0.85]
- **Bloomberg PSX Data Ingestion Pipeline** — aapltxt_bloomberg_ohlcv_data, claudemd_bloomberg_csv_tools, claudemd_simulation_module [INFERRED 0.82]
- **Real-time Trading System Components** — CLAUDE_SimulationClock, CLAUDE_OrderFillEngine, CLAUDE_WebSocketRealtime [EXTRACTED 1.00]
- **Authentication and Security System** — CLAUDE_JWTAuth, CLAUDE_PasswordHashing, CLAUDE_InviteOnlyRegistration [EXTRACTED 1.00]
- **Frontend State and Data Management** — CLAUDE_Zustand, CLAUDE_TanStackQuery, CLAUDE_WebSocketSingletonPool [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (19): Mailer, NoOpMailer, Service, TokenPair, handler(), contains(), containsRune(), isDuplicateError() (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (8): NewClock(), NewRepository(), parseCSVRow(), validateHeader(), Client, Clock, ClockRegistry, Repository

### Community 2 - "Community 2"
Cohesion: 0.15
Nodes (11): extractBearerToken(), GetClaims(), RequireAuth(), RequireRole(), BadRequest(), InternalError(), TokenParser, Handler (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (22): SMTPMailer, Config, getEnv(), Load(), parseDuration(), requireEnv(), NewHandler(), NewOrderRepository() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (21): detect_columns(), expand_daily_to_minutes(), forward_fill_gaps(), _in_session(), main(), parse_daily_file(), parse_datetime(), parse_intraday_file() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.1
Nodes (24): Admin Route Prefix Convention, Go Backend Architecture, Bloomberg to SimTrader CSV Conversion Tool, Directory Structure and Project Layout, React Frontend Architecture, Go 1.22+ with Fiber v2, Insufficient Resources WebSocket Issue, Invite-Only Registration Pattern (+16 more)

### Community 6 - "Community 6"
Cohesion: 0.14
Nodes (11): authResponse, forgotPasswordRequest, Handler, loginRequest, logoutRequest, refreshRequest, registerRequest, resetPasswordRequest (+3 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (17): forward_fill_gaps(), _in_session(), main(), parse_bloomberg_paste(), _parse_price(), _parse_volume(), _pkt_to_datetime(), _pkt_to_utc() (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (7): Close(), Connect(), OrderRepository, getConn(), notify(), wsConnect(), wsDisconnect()

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (5): Handler, Portfolio, Position, Repository, SimRepo

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
Nodes (3): handleFileUpload(), handleReupload(), invalidate()

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (3): Simulation, Status, TickBroadcast

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (0): 

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (2): fmt(), fmtCurrency()

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

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
Nodes (2): AAPL Bloomberg OHLCV Raw Data (1-min bars, 2026-04-01), Bloomberg â†’ SimTrader CSV Workflow

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

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
Nodes (1): Portfolio Management System (Auto P&L)

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (1): Order Management System

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (1): Admin Dashboard & Simulation Controls

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): Real-Time WebSocket Integration

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (1): SimulationTimer Component

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (1): Frontend Infrastructure (React+TS+Vite+Tailwind)

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Authentication & User Management (Invite Flow)

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): QWEN.md â€” SimTrader Context for Qwen Code

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (1): SimTrader Monorepo (3-component structure)

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (1): Security Feature Set (short-lived tokens, rotation, bcrypt)

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (1): Frontend Design System (Button, Card, Badge, StatCard)

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Admin+Student Session Workflow

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): Railway Deployment (Backend)

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): Role-Based Access Control (Admin/Student)

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): Module Pattern (modelâ†’repositoryâ†’serviceâ†’handler)

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): Mailer (SMTP + NoOp Dev Mode)

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): Database Migrations (SQL schema + seed admin)

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): PSX Session Details (09:30-15:30 PKT, 360 bars)

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): PSX Stock Teaching Categories (Large/Mid/Volatile/Defensive)

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): Light/Dark Mode Toggle UI Component

## Knowledge Gaps
- **82 isolated node(s):** `loginRequest`, `registerRequest`, `refreshRequest`, `logoutRequest`, `forgotPasswordRequest` (+77 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 20`** (2 nodes): `processPending()`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `clsx()`, `DashboardLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `clsx()`, `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `AdminLayout()`, `AdminLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `handleSubmit()`, `AdminSettingsPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `handleSubmit()`, `LoginPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `fmt()`, `ChartPageold.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `fmt()`, `OrderBookPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `fmt()`, `OrdersPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `AAPL Bloomberg OHLCV Raw Data (1-min bars, 2026-04-01)`, `Bloomberg â†’ SimTrader CSV Workflow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `gemma.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `adapter.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `order.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `portfolio.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `simulation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `user.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `AdminOverviewPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `ProfilePage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `Portfolio Management System (Auto P&L)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `Order Management System`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `Admin Dashboard & Simulation Controls`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `Real-Time WebSocket Integration`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `SimulationTimer Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `Frontend Infrastructure (React+TS+Vite+Tailwind)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Authentication & User Management (Invite Flow)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `QWEN.md â€” SimTrader Context for Qwen Code`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `SimTrader Monorepo (3-component structure)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `Security Feature Set (short-lived tokens, rotation, bcrypt)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `Frontend Design System (Button, Card, Badge, StatCard)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Admin+Student Session Workflow`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `Railway Deployment (Backend)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `Role-Based Access Control (Admin/Student)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `Module Pattern (modelâ†’repositoryâ†’serviceâ†’handler)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `Mailer (SMTP + NoOp Dev Mode)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `Database Migrations (SQL schema + seed admin)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `PSX Session Details (09:30-15:30 PKT, 360 bars)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `PSX Stock Teaching Categories (Large/Mid/Volatile/Defensive)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `Light/Dark Mode Toggle UI Component`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 8`, `Community 11`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `Status` connect `Community 2` to `Community 9`, `Community 3`, `Community 6`, `Community 1`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `set()` connect `Community 4` to `Community 8`?**
  _High betweenness centrality (0.067) - this node is a cross-community bridge._
- **Are the 30 inferred relationships involving `BadRequest()` (e.g. with `.Login()` and `.CompleteRegistration()`) actually correct?**
  _`BadRequest()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Are the 27 inferred relationships involving `Status` (e.g. with `main()` and `jsonErrorHandler()`) actually correct?**
  _`Status` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `InternalError()` (e.g. with `Status` and `.SubmitOrder()`) actually correct?**
  _`InternalError()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `loginRequest`, `registerRequest`, `refreshRequest` to the rest of the system?**
  _82 weakly-connected nodes found - possible documentation gaps or missing edges._