# SimTrader Backend

Stock market simulation platform — Go backend.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Go | 1.22+ | https://go.dev/dl/ |
| PostgreSQL | 16+ | https://www.postgresql.org/download/ |
| make | any | pre-installed on macOS/Linux; Windows: use Git Bash |
| psql | any | included with PostgreSQL |

---

## First-time setup

### 1. Clone and install dependencies

```bash
git clone <your-repo-url>
cd simtrader/backend
make tidy          # downloads all Go dependencies
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `DATABASE_URL` — your local PostgreSQL connection string
- `JWT_ACCESS_SECRET` — run `openssl rand -hex 64` to generate
- `JWT_REFRESH_SECRET` — run `openssl rand -hex 64` again (different value)
- Leave SMTP settings blank for local dev — emails print to console instead

### 3. Create the database

```bash
# Create a local database named simtrader
psql -U postgres -c "CREATE DATABASE simtrader;"
```

### 4. Run migrations

```bash
make migrate
```

This creates the `users` and `refresh_tokens` tables and seeds the first admin account:
- Email: `admin@simtrader.app`
- Password: `ChangeMe123!`

**Change this password immediately after first login.**

### 5. Start the server

```bash
make run
```

Server starts at `http://localhost:8080`.

---

## Key endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Student/admin login |
| `POST` | `/api/auth/register` | None | Complete registration (from invite link) |
| `POST` | `/api/auth/refresh` | None | Get new access token |
| `POST` | `/api/auth/logout` | None | Revoke refresh token |
| `POST` | `/api/auth/forgot-password` | None | Send reset email |
| `POST` | `/api/auth/reset-password` | None | Set new password |
| `GET` | `/api/me` | Student/Admin | Get own profile |
| `PUT` | `/api/me` | Student/Admin | Update name |
| `PUT` | `/api/me/password` | Student/Admin | Change password |
| `GET` | `/api/admin/users` | Admin only | List all users |
| `POST` | `/api/admin/users/invite` | Admin only | Invite a student |
| `GET` | `/api/admin/users/:id` | Admin only | Get user details |
| `POST` | `/api/admin/users/:id/block` | Admin only | Block student |
| `POST` | `/api/admin/users/:id/unblock` | Admin only | Unblock student |
| `GET` | `/health` | None | Health check (used by UptimeRobot) |

---

## Project structure

```
simtrader/backend/
├── cmd/
│   └── server/
│       └── main.go          ← Entry point — wires everything together
├── internal/
│   ├── auth/
│   │   ├── service.go       ← Login, JWT, invite, password reset logic
│   │   ├── handler.go       ← HTTP handlers for /api/auth/*
│   │   └── mailer.go        ← Email sending (SMTP + NoOp dev mode)
│   ├── user/
│   │   ├── model.go         ← User struct + PublicProfile
│   │   ├── repository.go    ← All database queries for users
│   │   └── handler.go       ← HTTP handlers for /api/me and /api/admin/users
│   ├── middleware/
│   │   └── auth.go          ← RequireAuth + RequireRole middleware
│   ├── config/
│   │   └── config.go        ← Environment variable loading
│   └── db/
│       └── db.go            ← PostgreSQL connection pool
├── migrations/
│   └── 001_create_users.sql ← Database schema + seed admin
├── scripts/
│   └── hash_password.go     ← bcrypt hash generator utility
├── .env.example             ← Environment variable template
├── .gitignore
├── go.mod
└── Makefile                 ← make run / build / migrate / hash
```

---

## Deploying to Railway

1. Create a new Railway project
2. Add a PostgreSQL service — Railway gives you a `DATABASE_URL` automatically
3. Add your Go service, pointed at this repo
4. Set all environment variables from `.env.example` in the Railway dashboard
5. Railway auto-detects Go and runs `go build ./cmd/server/main.go`
6. Connect the PostgreSQL service URL to your `DATABASE_URL` variable
7. Run migrations: use Railway's psql console → `\i migrations/001_create_users.sql`

Railway will auto-restart the service if it crashes. The `/health` endpoint is
what UptimeRobot pings — add it at https://uptimerobot.com (free tier).

---

## Adding the next module

When implementing the simulation clock (next module), add:
```
internal/
  simulation/
    model.go       ← Simulation, PriceTick structs
    repository.go  ← DB queries
    service.go     ← Clock goroutine, broadcast logic
    handler.go     ← HTTP + WebSocket handlers
```

The pattern is identical to the auth module. Follow it consistently.

---

## Security notes

- Access tokens expire in 15 minutes — short window if stolen
- Refresh tokens are single-use (rotation) — replayed tokens are rejected
- Refresh tokens are stored as SHA-256 hashes — raw tokens never touch the DB
- Passwords are bcrypt cost=12 — intentionally slow
- Login errors are deliberately vague — doesn't reveal if email exists
- Password reset always returns 200 — doesn't reveal if email is registered
- Block immediately revokes all active sessions
