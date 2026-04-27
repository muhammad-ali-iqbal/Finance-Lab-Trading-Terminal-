# SimTrader — Deployment Readiness Checklist

Each item is a pass/fail check. The application is considered ready for deployment only when every item is marked passing. Test with two browser profiles running simultaneously: one logged in as **admin**, one as a **student**.

---

## 1. Infrastructure & Configuration

| # | Check | Pass |
|---|-------|------|
| 1.1 | `GET /health` returns HTTP 200 and confirms database connectivity | ☐ |
| 1.2 | Backend starts without errors (`go run ./cmd/server/main.go`) | ☐ |
| 1.3 | Frontend builds without TypeScript errors (`npm run build`) | ☐ |
| 1.4 | All database migrations apply cleanly with no errors | ☐ |
| 1.5 | CORS allows requests from the frontend origin and blocks all others | ☐ |
| 1.6 | CSV upload accepts files up to 60 MB and rejects files above the limit | ☐ |
| 1.7 | Backend shuts down gracefully — active WebSocket connections drain within 10 seconds | ☐ |

---

## 2. Authentication

| # | Check | Pass |
|---|-------|------|
| 2.1 | Admin can log in with correct credentials and is redirected to the admin dashboard | ☐ |
| 2.2 | Student can log in with correct credentials and is redirected to the student dashboard | ☐ |
| 2.3 | Login with a wrong password returns an error and does not grant access | ☐ |
| 2.4 | Login with a non-existent email returns an error | ☐ |
| 2.5 | JWT access token expires as configured; subsequent requests return 401 | ☐ |
| 2.6 | Token refresh (`POST /api/auth/refresh`) issues a new access token | ☐ |
| 2.7 | A used refresh token cannot be reused (single-use rotation) | ☐ |
| 2.8 | Logout revokes the session; the old refresh token is rejected afterward | ☐ |
| 2.9 | Unauthenticated requests to protected routes return 401 | ☐ |

---

## 3. Invite & Registration

| # | Check | Pass |
|---|-------|------|
| 3.1 | Admin can invite a student by email; invite token appears in the backend console (dev) | ☐ |
| 3.2 | Visiting `/register?token=<TOKEN>` renders the registration form | ☐ |
| 3.3 | Student can complete registration (first name, last name, password) using a valid token | ☐ |
| 3.4 | Registering with an already-used token returns an error | ☐ |
| 3.5 | Registering with an invalid or missing token returns an error | ☐ |
| 3.6 | Attempting self-registration without a token is rejected | ☐ |

---

## 4. Password Reset

| # | Check | Pass |
|---|-------|------|
| 4.1 | Forgot-password flow generates a reset token (printed to console in dev) | ☐ |
| 4.2 | Submitting a valid reset token and new password changes the password | ☐ |
| 4.3 | Logging in with the new password succeeds | ☐ |
| 4.4 | The old password is rejected after reset | ☐ |
| 4.5 | A used reset token cannot be reused | ☐ |

---

## 5. Role Isolation

| # | Check | Pass |
|---|-------|------|
| 5.1 | A student JWT cannot access any `/api/admin/*` route — all return 403 | ☐ |
| 5.2 | An admin can access all `/api/admin/*` routes | ☐ |
| 5.3 | A student can access their own portfolio and orders but not another student's | ☐ |
| 5.4 | An admin cannot place orders or view student-specific portfolio via student endpoints | ☐ |

---

## 6. User Management (Admin)

| # | Check | Pass |
|---|-------|------|
| 6.1 | Admin Users page lists all students with correct status badges (Active / Pending / Blocked) | ☐ |
| 6.2 | Search/filter by status (All / Active / Pending / Blocked) works correctly | ☐ |
| 6.3 | Admin can block a student; blocked student's next request returns 401/403 | ☐ |
| 6.4 | Admin can unblock a blocked student; student can log in again afterward | ☐ |
| 6.5 | Admin accounts show the "Admin" label and have no block/unblock button | ☐ |

---

## 7. Simulation Lifecycle (Admin)

| # | Check | Pass |
|---|-------|------|
| 7.1 | Admin can create a simulation with name, description, speed multiplier, and starting cash | ☐ |
| 7.2 | New simulation appears in the list with status **Draft** | ☐ |
| 7.3 | Admin can edit name and description of a Draft simulation | ☐ |
| 7.4 | Admin can upload a valid SimTrader CSV to a Draft simulation | ☐ |
| 7.5 | Uploading a malformed or empty CSV shows a clear error and leaves status unchanged | ☐ |
| 7.6 | Admin can Start a simulation that has CSV data — status becomes **Active** | ☐ |
| 7.7 | Starting a simulation without CSV data is rejected with a clear error | ☐ |
| 7.8 | Only one simulation can be Active at a time; attempting to start a second is blocked | ☐ |
| 7.9 | Admin can Pause an active simulation — clock stops, status becomes **Paused** | ☐ |
| 7.10 | Admin can Resume a paused simulation — clock resumes from where it stopped | ☐ |
| 7.11 | Admin can Complete a simulation — status becomes **Completed**, clock stops | ☐ |
| 7.12 | Admin can Restart a simulation — clock resets to beginning, all student orders/portfolios are cleared | ☐ |
| 7.13 | Admin can re-upload CSV data on a Paused or Completed simulation | ☐ |
| 7.14 | Admin can delete a simulation and all associated data is removed | ☐ |

---

## 8. Real-Time Clock & WebSocket

| # | Check | Pass |
|---|-------|------|
| 8.1 | When simulation starts, students receive live price ticks via WebSocket | ☐ |
| 8.2 | Price chart updates in real time as ticks arrive | ☐ |
| 8.3 | When simulation is paused, ticks stop arriving; chart freezes | ☐ |
| 8.4 | When simulation is resumed, ticks resume from the correct simulated timestamp | ☐ |
| 8.5 | Two students connected simultaneously both receive the same ticks in the same order | ☐ |
| 8.6 | Opening multiple browser tabs does not create multiple WebSocket connections (singleton pool) | ☐ |
| 8.7 | If the browser disconnects and reconnects, the WebSocket re-establishes and ticks resume | ☐ |
| 8.8 | Chart displays only ticks up to the current simulated time — no future prices leak | ☐ |
| 8.9 | Simulation progress indicator (timer) advances at the correct speed per the multiplier | ☐ |

---

## 9. Order Entry

| # | Check | Pass |
|---|-------|------|
| 9.1 | Student can place a **Market Buy** order; it is filled at the next tick's close price | ☐ |
| 9.2 | Student can place a **Market Sell** order for shares they hold; it fills at the next tick | ☐ |
| 9.3 | Student can place a **Limit Buy** order; it remains pending until bar's low ≤ limit price | ☐ |
| 9.4 | Student can place a **Limit Sell** order; it remains pending until bar's high ≥ limit price | ☐ |
| 9.5 | Student can place a **Stop Buy** order; it triggers when bar's high ≥ stop price | ☐ |
| 9.6 | Student can place a **Stop Sell** order; it triggers when bar's low ≤ stop price | ☐ |
| 9.7 | An order with insufficient cash balance is **rejected** with a clear error message | ☐ |
| 9.8 | A sell order for more shares than held is **rejected** with a clear error message | ☐ |
| 9.9 | Estimated cost/proceeds on the order form matches actual fill value | ☐ |
| 9.10 | Order cannot be submitted if no simulation is active | ☐ |
| 9.11 | Symbol selector shows all available symbols with live prices | ☐ |

---

## 10. Order Management

| # | Check | Pass |
|---|-------|------|
| 10.1 | Orders page shows the full order history with correct columns (time, symbol, side, type, qty, price, fill price, status) | ☐ |
| 10.2 | Status badges are color-coded correctly (filled=green, rejected=red, pending=gray, cancelled=gray) | ☐ |
| 10.3 | Student can cancel a **pending** order; status updates to Cancelled | ☐ |
| 10.4 | A filled order cannot be cancelled — cancel button is absent | ☐ |
| 10.5 | Order list refreshes automatically and reflects fills as they happen | ☐ |
| 10.6 | Two students placing orders simultaneously do not experience double-fills or data corruption | ☐ |

---

## 11. Portfolio & P&L

| # | Check | Pass |
|---|-------|------|
| 11.1 | Portfolio is created automatically on first visit with the configured starting cash | ☐ |
| 11.2 | Cash balance decreases correctly after a buy order fills | ☐ |
| 11.3 | Cash balance increases correctly after a sell order fills | ☐ |
| 11.4 | Position quantity and weighted average cost update correctly after each fill | ☐ |
| 11.5 | Selling all shares of a symbol removes that position from the holdings table | ☐ |
| 11.6 | Unrealized P&L per position = (current price − avg cost) × quantity | ☐ |
| 11.7 | Total equity = cash balance + sum of all position market values | ☐ |
| 11.8 | Portfolio values update in real time as live tick prices arrive via WebSocket | ☐ |
| 11.9 | Portfolio history chart shows equity curve over the played portion of the simulation | ☐ |
| 11.10 | Asset allocation chart reflects current position market values and remaining cash | ☐ |

---

## 12. Leaderboard

| # | Check | Pass |
|---|-------|------|
| 12.1 | Leaderboard ranks all students by total equity (descending) | ☐ |
| 12.2 | Rank updates as portfolio values change during the simulation | ☐ |
| 12.3 | Student's own rank is visible on their dashboard | ☐ |
| 12.4 | Students with equal equity are handled without error (no crash or missing rows) | ☐ |

---

## 13. Chart

| # | Check | Pass |
|---|-------|------|
| 13.1 | Chart renders immediately on first visit without requiring a page reload | ☐ |
| 13.2 | Historical bars (already played) are loaded and visible on page return | ☐ |
| 13.3 | Switching between symbols updates the chart without a white-out or stale data | ☐ |
| 13.4 | Live bars append to the right of the chart as ticks arrive | ☐ |
| 13.5 | Chart does not show bars beyond the current simulated time | ☐ |

---

## 14. Data Pipeline (Pre-Deployment)

| # | Check | Pass |
|---|-------|------|
| 14.1 | `psx_to_simtrader.py` converts a sample PSX export to a valid SimTrader CSV | ☐ |
| 14.2 | `validate_simtrader_csv.py` reports PASSED on the converted file | ☐ |
| 14.3 | All symbols in the CSV have exactly 360 bars (or forward-fill covers the gaps) | ☐ |
| 14.4 | Timestamps in the output CSV are in UTC (`T04:30:00Z` session open) | ☐ |
| 14.5 | The converted CSV uploads successfully to a Draft simulation | ☐ |
| 14.6 | After uploading, starting the simulation broadcasts ticks for all symbols in the file | ☐ |

---

## 15. Multi-User Stress Check

Run this section with at least three simultaneous student sessions.

| # | Check | Pass |
|---|-------|------|
| 15.1 | Three students can connect to an active simulation simultaneously with no WebSocket errors | ☐ |
| 15.2 | All three students receive identical ticks in real time | ☐ |
| 15.3 | Each student's portfolio is isolated — trades by Student A do not affect Student B's cash or positions | ☐ |
| 15.4 | Multiple students placing orders on the same tick do not cause race conditions or rejected transactions | ☐ |
| 15.5 | Leaderboard correctly reflects all three students after each places at least one trade | ☐ |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Tester | | | |
| Admin | | | |

**Application status:** ☐ Ready for deployment — all checks passed
