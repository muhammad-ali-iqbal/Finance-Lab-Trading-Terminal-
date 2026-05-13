# ── Stage 1: Build Go binary ───────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder
WORKDIR /build

# Cache dependency downloads separately from source compilation
COPY simtrader/go.mod simtrader/go.sum ./
RUN go mod download

COPY simtrader/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
# python:3.11-slim gives us Python for the PSX tracker admin commands
# that the backend spawns via exec.CommandContext.
FROM python:3.11-slim

# postgresql-client provides pg_isready + psql for the entrypoint migration runner
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Go binary and SQL migrations
COPY --from=builder /build/server .
COPY simtrader/migrations/ ./migrations/

# PSX tracker Python code + dependencies
COPY psx_tracker/ ./psx_tracker/
RUN pip install --no-cache-dir -r ./psx_tracker/requirements.txt

# Directory for user-uploaded avatars (mount a volume here for persistence)
RUN mkdir -p uploads/avatars

COPY simtrader/entrypoint.sh .
RUN chmod +x entrypoint.sh

ENV PSX_TRACKER_DIR=/app/psx_tracker
ENV PYTHON_CMD=python3

EXPOSE 8080
ENTRYPOINT ["./entrypoint.sh"]
