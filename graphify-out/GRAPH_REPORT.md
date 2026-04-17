# Graph Report - .  (2026-04-17)

## Corpus Check
- 58 files · ~45,344 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 373 nodes · 651 edges · 45 communities detected
- Extraction: 60% EXTRACTED · 39% INFERRED · 0% AMBIGUOUS · INFERRED: 257 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `BadRequest()` - 31 edges
2. `Status` - 28 edges
3. `InternalError()` - 27 edges
4. `Repository` - 22 edges
5. `Handler` - 20 edges
6. `main()` - 16 edges
7. `Repository` - 16 edges
8. `Close()` - 14 edges
9. `Service` - 12 edges
10. `GetClaims()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `React Frontend (TypeScript/Vite)` --conceptually_related_to--> `Light/Dark Mode Toggle UI Component`  [AMBIGUOUS]
  CLAUDE.md → toggle.jpg
- `main()` --calls--> `NewSMTPMailer()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\auth\mailer.go
- `main()` --calls--> `NewService()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\auth\service.go
- `main()` --calls--> `NewEngine()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\order\engine.go
- `main()` --calls--> `NewOrderRepository()`  [INFERRED]
  simtrader\cmd\server\main.go → simtrader\internal\order\handler.go

## Hyperedges (group relationships)
- **Real-Time Tick Data Pipeline** — claudemd_simulation_clock, claudemd_websocket_singleton_pool, claudemd_use_simulation_socket [EXTRACTED 0.95]
- **Student Trading Flow (Order â†’ Portfolio â†’ P&L)** — claudemd_order_module, claudemd_portfolio_module, claudemd_simulation_clock [INFERRED 0.85]
- **Bloomberg PSX Data Ingestion Pipeline** — aapltxt_bloomberg_ohlcv_data, claudemd_bloomberg_csv_tools, claudemd_simulation_module [INFERRED 0.82]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (14): NewClock(), Close(), Handler, Portfolio, Position, Repository, SimRepo, NewRepository() (+6 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (12): GetClaims(), Handler, RequireRole(), BadRequest(), InternalError(), mapAuthError(), Handler, Handler (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (49): AAPL Bloomberg OHLCV Raw Data (1-min bars, 2026-04-01), Admin Route /admin/ Prefix Convention, Auth Module (internal/auth), Bloomberg CSV Conversion Tools (Python), Go Backend (Fiber v2), Graphify Knowledge Graph (graphify-out/), Invite-Only Student Registration, JWT Authentication (Access + Refresh Tokens) (+41 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (15): Mailer, NoOpMailer, Service, TokenPair, handler(), contains(), containsRune(), isDuplicateError() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (18): extractBearerToken(), RequireAuth(), Config, getEnv(), Load(), parseDuration(), requireEnv(), jsonErrorHandler() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (12): Connect(), NewOrderRepository(), Order, OrderBook, OrderBookLevel, OrderRepository, SimulationRepo, submitOrderRequest (+4 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (17): forward_fill_gaps(), _in_session(), main(), parse_bloomberg_paste(), _parse_price(), _parse_volume(), _pkt_to_datetime(), _pkt_to_utc() (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (13): authResponse, forgotPasswordRequest, loginRequest, logoutRequest, refreshRequest, registerRequest, resetPasswordRequest, NewHandler() (+5 more)

### Community 8 - "Community 8"
Cohesion: 0.43
Nodes (2): NewEngine(), Engine

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (2): useTheme(), ThemeToggle()

### Community 10 - "Community 10"
Cohesion: 0.47
Nodes (2): SMTPMailer, NewSMTPMailer()

### Community 11 - "Community 11"
Cohesion: 0.47
Nodes (3): handleFileUpload(), handleReupload(), invalidate()

### Community 12 - "Community 12"
Cohesion: 0.5
Nodes (3): Simulation, Status, TickBroadcast

### Community 13 - "Community 13"
Cohesion: 0.5
Nodes (0): 

### Community 14 - "Community 14"
Cohesion: 0.5
Nodes (0): 

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (0): 

### Community 16 - "Community 16"
Cohesion: 0.67
Nodes (0): 

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (2): fmt(), fmtCurrency()

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (3): httputil Package (internal/httputil), Rationale: Extract shared HTTP helpers to eliminate copy-paste across handlers, Session Log 2026-04-17 (httputil Refactor)

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

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
Nodes (0): 

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
Nodes (1): SimTrader CLAUDE.md Project Context

## Ambiguous Edges - Review These
- `React Frontend (TypeScript/Vite)` → `Light/Dark Mode Toggle UI Component`  [AMBIGUOUS]
  toggle.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **65 isolated node(s):** `loginRequest`, `registerRequest`, `refreshRequest`, `logoutRequest`, `forgotPasswordRequest` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 19`** (2 nodes): `processPending()`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `clsx()`, `DashboardLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `clsx()`, `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `AdminLayout()`, `AdminLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `handleSubmit()`, `AdminSettingsPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `handleSubmit()`, `LoginPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `fmt()`, `ChartPageold.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `fmt()`, `OrderBookPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `fmt()`, `OrdersPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `adapter.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (1 nodes): `order.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `portfolio.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `simulation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (1 nodes): `user.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `AdminOverviewPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (1 nodes): `ProfilePage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `SimTrader CLAUDE.md Project Context`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `React Frontend (TypeScript/Vite)` and `Light/Dark Mode Toggle UI Component`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `main()` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`, `Community 5`, `Community 7`, `Community 8`, `Community 10`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `Status` connect `Community 1` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `Close()` connect `Community 0` to `Community 8`, `Community 1`, `Community 4`, `Community 5`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Are the 30 inferred relationships involving `BadRequest()` (e.g. with `.Login()` and `.CompleteRegistration()`) actually correct?**
  _`BadRequest()` has 30 INFERRED edges - model-reasoned connections that need verification._
- **Are the 27 inferred relationships involving `Status` (e.g. with `main()` and `jsonErrorHandler()`) actually correct?**
  _`Status` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 26 inferred relationships involving `InternalError()` (e.g. with `Status` and `.SubmitOrder()`) actually correct?**
  _`InternalError()` has 26 INFERRED edges - model-reasoned connections that need verification._