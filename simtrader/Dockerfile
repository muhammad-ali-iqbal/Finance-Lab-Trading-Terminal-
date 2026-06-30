# ── Stage 1: Build Go binary ───────────────────────────────────────────────────
# Pinned to a specific patch (INFRA-04). For full reproducibility, pin by digest
# in CI:  FROM golang:1.22.5-alpine@sha256:<digest> AS builder
FROM golang:1.22.5-alpine AS builder
WORKDIR /build

# Cache dependency downloads separately from source compilation
COPY simtrader/go.mod simtrader/go.sum ./
RUN go mod download

COPY simtrader/ .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
# python:3.11-slim gives us Python for the PSX tracker admin commands
# that the backend spawns via exec.CommandContext. Pinned to a patch (INFRA-04).
FROM python:3.11.9-slim

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

# Non-root user for security
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup appuser \
 && mkdir -p uploads/avatars \
 && chown -R appuser:appgroup /app

COPY simtrader/entrypoint.sh .
RUN chmod +x entrypoint.sh

USER appuser

ENV PSX_TRACKER_DIR=/app/psx_tracker
ENV PYTHON_CMD=python3

EXPOSE 8080

# Container-level readiness probe (INFRA-05) — also wired in docker-compose.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health').status==200 else 1)" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
