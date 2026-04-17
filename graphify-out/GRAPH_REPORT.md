# Graph Report - .  (2026-04-17)

## Corpus Check
- Corpus is ~45,221 words - fits in a single context window. You may not need a graph.

## Summary
- 386 nodes · 730 edges · 48 communities detected
- Extraction: 64% EXTRACTED · 36% INFERRED · 0% AMBIGUOUS · INFERRED: 262 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Server Utilities|Core Server Utilities]]
- [[_COMMUNITY_Platform Architecture & Docs|Platform Architecture & Docs]]
- [[_COMMUNITY_Auth Middleware & Routing|Auth Middleware & Routing]]
- [[_COMMUNITY_Auth Service & Mailer|Auth Service & Mailer]]
- [[_COMMUNITY_Order & Portfolio Repository|Order & Portfolio Repository]]
- [[_COMMUNITY_Bloomberg Data Tools|Bloomberg Data Tools]]
- [[_COMMUNITY_Simulation Clock Utilities|Simulation Clock Utilities]]
- [[_COMMUNITY_Portfolio Handler|Portfolio Handler]]
- [[_COMMUNITY_Order Models & Handler|Order Models & Handler]]
- [[_COMMUNITY_Auth Handler & Tokens|Auth Handler & Tokens]]
- [[_COMMUNITY_Order Fill Engine|Order Fill Engine]]
- [[_COMMUNITY_Theme & UI Context|Theme & UI Context]]
- [[_COMMUNITY_SMTP Mailer|SMTP Mailer]]
- [[_COMMUNITY_Config Loader|Config Loader]]
- [[_COMMUNITY_Admin Simulations Page|Admin Simulations Page]]
- [[_COMMUNITY_Simulation Model|Simulation Model]]
- [[_COMMUNITY_Simulation Timer UI|Simulation Timer UI]]
- [[_COMMUNITY_Order Entry UI|Order Entry UI]]
- [[_COMMUNITY_App Router|App Router]]
- [[_COMMUNITY_Admin Users Page|Admin Users Page]]
- [[_COMMUNITY_Portfolio UI|Portfolio UI]]
- [[_COMMUNITY_API Client|API Client]]
- [[_COMMUNITY_Dashboard Layout|Dashboard Layout]]
- [[_COMMUNITY_UI Component Library|UI Component Library]]
- [[_COMMUNITY_Admin Layout|Admin Layout]]
- [[_COMMUNITY_Admin Settings Page|Admin Settings Page]]
- [[_COMMUNITY_Login Page|Login Page]]
- [[_COMMUNITY_Chart Page (Legacy)|Chart Page (Legacy)]]
- [[_COMMUNITY_Order Book UI|Order Book UI]]
- [[_COMMUNITY_Orders List UI|Orders List UI]]
- [[_COMMUNITY_WebSocket Adapter|WebSocket Adapter]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_Tailwind Config|Tailwind Config]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Frontend Entry Point|Frontend Entry Point]]
- [[_COMMUNITY_Vite Env Types|Vite Env Types]]
- [[_COMMUNITY_Auth API Client|Auth API Client]]
- [[_COMMUNITY_API Index|API Index]]
- [[_COMMUNITY_Order API Client|Order API Client]]
- [[_COMMUNITY_Portfolio API Client|Portfolio API Client]]
- [[_COMMUNITY_Simulation API Client|Simulation API Client]]
- [[_COMMUNITY_User API Client|User API Client]]
- [[_COMMUNITY_Admin Overview Page|Admin Overview Page]]
- [[_COMMUNITY_Profile Page|Profile Page]]
- [[_COMMUNITY_Auth Zustand Store|Auth Zustand Store]]
- [[_COMMUNITY_API Re-exports|API Re-exports]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]

## God Nodes (most connected - your core abstractions)
1. `badRequest()` - 33 edges
2. `Status` - 30 edges
3. `BadRequest()` - 30 edges
4. `internalError()` - 28 edges
5. `InternalError()` - 26 edges
6. `Repository` - 22 edges
7. `Handler` - 20 edges
8. `main()` - 16 edges
9. `Repository` - 16 edges
10. `Close()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Light/Dark Mode Toggle UI Component` --conceptually_related_to--> `React Frontend (TypeScript/Vite)`  [AMBIGUOUS]
  toggle.jpg → CLAUDE.md
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

### Community 0 - "Core Server Utilities"
Cohesion: 0.06
Nodes (16): NewClock(), Close(), jsonErrorHandler(), main(), NewRepository(), parseCSVRow(), validateHeader(), RequireAuth() (+8 more)

### Community 1 - "Platform Architecture & Docs"
Cohesion: 0.06
Nodes (19): Mailer, NoOpMailer, Service, TokenPair, handler(), contains(), containsRune(), isDuplicateError() (+11 more)

### Community 2 - "Auth Middleware & Routing"
Cohesion: 0.15
Nodes (13): GetClaims(), Handler, BadRequest(), InternalError(), badRequest(), internalError(), mapAuthError(), Handler (+5 more)

### Community 3 - "Auth Service & Mailer"
Cohesion: 0.06
Nodes (49): AAPL Bloomberg OHLCV Raw Data (1-min bars, 2026-04-01), Admin Route /admin/ Prefix Convention, Auth Module (internal/auth), Bloomberg CSV Conversion Tools (Python), Go Backend (Fiber v2), Graphify Knowledge Graph (graphify-out/), Invite-Only Student Registration, JWT Authentication (Access + Refresh Tokens) (+41 more)

### Community 4 - "Order & Portfolio Repository"
Cohesion: 0.17
Nodes (17): forward_fill_gaps(), _in_session(), main(), parse_bloomberg_paste(), _parse_price(), _parse_volume(), _pkt_to_datetime(), _pkt_to_utc() (+9 more)

### Community 5 - "Bloomberg Data Tools"
Cohesion: 0.12
Nodes (13): authResponse, forgotPasswordRequest, loginRequest, logoutRequest, refreshRequest, registerRequest, resetPasswordRequest, NewHandler() (+5 more)

### Community 6 - "Simulation Clock Utilities"
Cohesion: 0.14
Nodes (8): Connect(), NewOrderRepository(), Order, OrderBook, OrderBookLevel, OrderRepository, SimulationRepo, submitOrderRequest

### Community 7 - "Portfolio Handler"
Cohesion: 0.19
Nodes (7): badRequest(), Handler, internalError(), Portfolio, Position, Repository, SimRepo

### Community 8 - "Order Models & Handler"
Cohesion: 0.24
Nodes (12): auth/handler.go, gofiber/fiber/v2 Dependency, httputil Package (internal/httputil), order/handler.go, portfolio/portfolio.go, Rationale: Extract shared HTTP helpers to eliminate copy-paste across handlers, Session Log 2026-04-17 (httputil Refactor), simulation/handler.go (+4 more)

### Community 9 - "Auth Handler & Tokens"
Cohesion: 0.43
Nodes (2): NewEngine(), Engine

### Community 10 - "Order Fill Engine"
Cohesion: 0.29
Nodes (2): useTheme(), ThemeToggle()

### Community 11 - "Theme & UI Context"
Cohesion: 0.47
Nodes (2): SMTPMailer, NewSMTPMailer()

### Community 12 - "SMTP Mailer"
Cohesion: 0.6
Nodes (5): Config, getEnv(), Load(), parseDuration(), requireEnv()

### Community 13 - "Config Loader"
Cohesion: 0.4
Nodes (4): extractBearerToken(), RequireAuth(), RequireRole(), TokenParser

### Community 14 - "Admin Simulations Page"
Cohesion: 0.47
Nodes (3): handleFileUpload(), handleReupload(), invalidate()

### Community 15 - "Simulation Model"
Cohesion: 0.4
Nodes (3): set(), _report(), validate()

### Community 16 - "Simulation Timer UI"
Cohesion: 0.5
Nodes (3): Simulation, Status, TickBroadcast

### Community 17 - "Order Entry UI"
Cohesion: 0.5
Nodes (0): 

### Community 18 - "App Router"
Cohesion: 0.5
Nodes (0): 

### Community 19 - "Admin Users Page"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Portfolio UI"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "API Client"
Cohesion: 1.0
Nodes (2): fmt(), fmtCurrency()

### Community 22 - "Dashboard Layout"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "UI Component Library"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Admin Layout"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Admin Settings Page"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Login Page"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Chart Page (Legacy)"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Order Book UI"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Orders List UI"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "WebSocket Adapter"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "PostCSS Config"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Tailwind Config"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Frontend Entry Point"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Vite Env Types"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Auth API Client"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "API Index"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Order API Client"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Portfolio API Client"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Simulation API Client"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "User API Client"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Admin Overview Page"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Profile Page"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Auth Zustand Store"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "API Re-exports"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): SimTrader CLAUDE.md Project Context

## Ambiguous Edges - Review These
- `React Frontend (TypeScript/Vite)` → `Light/Dark Mode Toggle UI Component`  [AMBIGUOUS]
  toggle.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **66 isolated node(s):** `loginRequest`, `registerRequest`, `refreshRequest`, `logoutRequest`, `forgotPasswordRequest` (+61 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Dashboard Layout`** (2 nodes): `processPending()`, `client.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UI Component Library`** (2 nodes): `clsx()`, `DashboardLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Layout`** (2 nodes): `clsx()`, `index.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Settings Page`** (2 nodes): `AdminLayout()`, `AdminLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Login Page`** (2 nodes): `handleSubmit()`, `AdminSettingsPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Chart Page (Legacy)`** (2 nodes): `handleSubmit()`, `LoginPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Order Book UI`** (2 nodes): `fmt()`, `ChartPageold.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Orders List UI`** (2 nodes): `fmt()`, `OrderBookPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `WebSocket Adapter`** (2 nodes): `fmt()`, `OrdersPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `PostCSS Config`** (1 nodes): `adapter.go`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Tailwind Config`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Frontend Entry Point`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Env Types`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth API Client`** (1 nodes): `vite-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Index`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Order API Client`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Portfolio API Client`** (1 nodes): `order.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Simulation API Client`** (1 nodes): `portfolio.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `User API Client`** (1 nodes): `simulation.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Admin Overview Page`** (1 nodes): `user.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Profile Page`** (1 nodes): `AdminOverviewPage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Auth Zustand Store`** (1 nodes): `ProfilePage.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `API Re-exports`** (1 nodes): `auth.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `SimTrader CLAUDE.md Project Context`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `React Frontend (TypeScript/Vite)` and `Light/Dark Mode Toggle UI Component`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `main()` connect `Core Server Utilities` to `Platform Architecture & Docs`, `Auth Middleware & Routing`, `Bloomberg Data Tools`, `Simulation Clock Utilities`, `Auth Handler & Tokens`, `Theme & UI Context`, `SMTP Mailer`, `Config Loader`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Why does `Status` connect `Auth Middleware & Routing` to `Core Server Utilities`, `Config Loader`, `Portfolio Handler`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `badRequest()` connect `Auth Middleware & Routing` to `Core Server Utilities`, `Platform Architecture & Docs`, `Bloomberg Data Tools`, `Simulation Clock Utilities`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `Status` (e.g. with `main()` and `jsonErrorHandler()`) actually correct?**
  _`Status` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 29 inferred relationships involving `BadRequest()` (e.g. with `.Login()` and `.CompleteRegistration()`) actually correct?**
  _`BadRequest()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `InternalError()` (e.g. with `.SubmitOrder()` and `.ListOrders()`) actually correct?**
  _`InternalError()` has 25 INFERRED edges - model-reasoned connections that need verification._