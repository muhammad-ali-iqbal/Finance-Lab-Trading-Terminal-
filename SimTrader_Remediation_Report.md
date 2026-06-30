# SimTrader — Security Remediation Report

**Date:** 2026-06-11
**Scope:** Remediation of the findings in `SimTrader_Security_Audit_Report.docx`
**Verification:** `go build ./...` ✓ · `go vet ./...` ✓ · `python -m py_compile` ✓ · `docker compose config` ✓

This document records the fix applied for every open/partial finding from the
internal audit. All **6 open HIGH** and **9 open/partial MEDIUM** findings are
closed in code; the LOW/INFO items are closed except for a small number that are
intentionally accepted-and-documented (listed at the end with rationale).

---

## HIGH severity — all closed

| ID | Finding | Fix |
|----|---------|-----|
| **AUTH-01** | Invite/reset tokens stored in plaintext | Tokens are now SHA-256 hashed (via the existing `hashToken`) before storage **and** before lookup. The raw token lives only in the email/URL. `auth/service.go`, `user/repository.go`, migration `006`. |
| **AVAIL-01** | Reconciler fills not transactional | Each order now fills inside a single `pgx` transaction (`reconciler.fillOrder`): cash, position upsert and order-status update either all commit or all roll back. `challenge/reconciler.go`. |
| **AVAIL-02** | Reconciler double-fill under concurrency | Reconciliation is serialized with a `sync.Mutex`; each fill locks the order row `FOR UPDATE` and the final `UPDATE … WHERE id=$1 AND status='pending'` checks rows-affected, so a concurrent run can never re-fill. Idempotent across all three trigger paths. |
| **INFRA-01** | No TLS anywhere | Added a **Caddy** reverse proxy (`Caddyfile`, `docker-compose.yml`) with automatic HTTPS/ACME, HTTP→HTTPS redirect, and HSTS. The frontend no longer publishes port 80 to the host — only Caddy exposes 80/443. |
| **SECRET-01** | psx_tracker ships `dev-internal-secret` default | `config.py` now reads `INTERNAL_SECRET` with **no default** and exits at import if unset. A 401 from the EOD push is surfaced distinctly from a network error (`PushAuthError` + alert). |
| **INFRA-02 / DATA-01** | Default admin boots when `ADMIN_*` unset | Seed admin now ships **`blocked`** with an unusable password hash (migration `001`); migration `006` blocks any pre-existing default. `entrypoint.sh` **refuses to boot in production** if `ADMIN_EMAIL`/`ADMIN_PASSWORD` are unset, and generates a random one-time password in dev. Both vars added to `.env.example` and enforced in compose with `${VAR:?}`. |

---

## MEDIUM severity — all closed

| ID | Finding | Fix |
|----|---------|-----|
| **AUTH-02** | Invite tokens never expire | Added `invite_expiry` column (migration `006`); set to `NOW()+7d` at invite time; `GetByInviteToken` enforces `invite_expiry > NOW()`. |
| **AVAIL-03** | Scraper silently degrades to empty data | Header-shape assertion raises `ScraperError` on a PSX layout change; zero/low-row fetches on a trading day are logged as `error` and **alerted** (`_alert`) instead of recorded `ok`. |
| **DEP-01** | Python deps fully unpinned | `requirements.txt` pinned to exact versions; Dockerfile documents the `pip-compile --generate-hashes` path for full hash pinning. |
| **NET-01** | Internal EOD endpoint public + unthrottled | nginx now **denies** `/api/internal/` from the public path; the backend adds a strict rate limiter on the route. |
| **NET-02** | No security headers (and false FACULTY_QNA claim) | Fiber `helmet` adds CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, HSTS; nginx sets an equivalent CSP + headers for the SPA. `FACULTY_QNA.md` corrected to match reality. |
| **SECRET-02** | Real secrets in OneDrive-synced `.env` | **Operational** — see "Action required by you" below. Code change: TLS/secret handling hardened so reuse is caught; `.gitignore` tightened. |
| **CORS-01** | Wildcard CORS reflection in dev | Reflection now requires `ENV=development` **and** explicit `CORS_ALLOW_ANY=true`; otherwise only localhost/LAN origins are reflected. Production never reflects. |
| **NET-03** | Rate limiter keyed on proxy IP; refresh unthrottled | Fiber configured with `EnableTrustedProxyCheck` + `ProxyHeader: X-Real-IP` + trusted CIDRs, so the limiter keys on the real client IP. Added a dedicated limiter on `/refresh` and `/logout`. |
| **DATA-03** | DB TLS not enforced | `db.Connect` rejects a non-TLS `DATABASE_URL` in production (`sslmode=disable/allow/prefer` or unset). The internal-compose Postgres opts out explicitly via `DB_REQUIRE_TLS=false` (logged); a managed DB keeps TLS on. |

---

## LOW / INFO — closed

| ID | Fix |
|----|-----|
| **AUTH-03** | New `passwords.Validate`: min 12 chars, 72-byte cap, common-password denylist — applied in register, reset, and change-password. |
| **AUTH-04** | `middleware.StatusGuard` (30 s TTL cache) re-checks blocked status on every request, so blocks take effect within seconds, not 15 min. |
| **AUTH-06** | Malformed `JWT_*_EXPIRY` now fails startup instead of silently defaulting to 15 m. |
| **AUTHZ-01** | Simulation leaderboard anonymizes names ("First L.") for students; full names only for admins. |
| **AVAIL-04** | Scheduler pins `Asia/Karachi` via `TZ`+`tzset`, adds bounded same-day retries, and caps catch-up backfill at 90 days with a loud alert (no silent truncation). |
| **AVAIL-05** | Mailer enforces TLS: STARTTLS required (or implicit TLS on 465), aborts on cleartext. |
| **DATA-02** | Backend refuses to start in production with the token-printing `NoOpMailer`. |
| **DATA-04** | Periodic (6 h) cleanup goroutine purges expired/revoked refresh tokens and clears lapsed reset/invite tokens. |
| **DATA-05** | `.gitignore` adds generic `.env.*` (keeps `.env.example`) and `__pycache__`; `simtrader-frontend.rar` and `psx_data.db` untracked. |
| **DEP-03** | `.github/workflows/security-audit.yml` runs govulncheck / npm audit / pip-audit on push + weekly; `make audit` for local runs. |
| **INFRA-03** | Migration runner uses `--single-transaction`, `ON_ERROR_STOP=1`, a `schema_migrations` table, and a `pg_advisory_xact_lock`. |
| **INFRA-04** | Base images pinned to specific patch versions; digest-pinning documented for CI. |
| **INFRA-05** | Healthchecks added for backend (`/health`) and frontend (`/healthz`); dependents wait on `service_healthy`. |
| **INPUT-01** | Leaderboard last-initial slice guarded against empty names; name (≤100/≤200) and description (≤2000) length caps added. |
| **INPUT-02** | Avatar upload verifies real image magic bytes via `http.DetectContentType`; `/uploads` served with `nosniff` + `Content-Disposition`. |
| **INPUT-03** | Order symbols normalized (uppercase/trim), format-validated, and checked against known EOD symbols. |
| **INPUT-04** | Internal EOD ingest validates the date against a strict `YYYY-MM-DD` regex. |
| **DEP-02** | Already mitigated by committed lockfile + `npm ci`; now gated by `npm audit` in CI. |

---

## Intentionally accepted / documented (no code change)

- **AUTH-05** (WS token in query string): a browser WebSocket API limitation; the token is validated correctly and access tokens are short-lived (15 m). The app's own logger never logs query strings. Documented; revisit with a one-time WS ticket if a fronting proxy logs query strings.
- **AUTHZ-02** (simulation read endpoints shared across classes): by design — ticks/order-book are shared, anonymized market data with no per-user identifiers.
- **INFRA-06** (backend image bundles Python): intentional — the backend shells out to the PSX tracker. Mitigated by non-root + multi-stage build.
- **SECRET-04** (shared `INTERNAL_SECRET`): correct by design; the dangerous default was the real issue and is now closed (SECRET-01).

---

## Action required by you (operational)

1. **Rotate the secrets in the local `simtrader/.env`** (SECRET-02). The JWT secrets, DB password and `INTERNAL_SECRET` in that OneDrive-synced file should be treated as compromised — generate fresh values (`openssl rand -hex 64` / `-hex 32`) and never reuse the old ones in any deployment.
2. **Set the new required env vars** before deploying: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DOMAIN`, `ACME_EMAIL`, and (in production) `SMTP_HOST`. See the updated `.env.example`. `docker compose up` now fails fast if any required secret is empty.
3. **Commit the staged deletions** of `simtrader-frontend.rar` and `psx_tracker/psx_data.db`. If either ever contained real secrets, scrub history with `git filter-repo`/BFG.
4. **Managed-DB note:** if you move Postgres off the single host (Render/Railway/etc.), drop `DB_REQUIRE_TLS=false` and use a `DATABASE_URL` with `sslmode=require` — TLS enforcement re-engages automatically.

---

## Residual risk

With the above in place, the four headline risks from the audit (no TLS,
default admin, tracker secret default, non-transactional reconciliation) are
closed. Residual risk drops from **Elevated** to **Low–Moderate**, gated mainly
on the operational rotation of the previously-exposed local `.env` secrets. A
dynamic/penetration test of the deployed environment remains recommended as a
confirmatory step.
