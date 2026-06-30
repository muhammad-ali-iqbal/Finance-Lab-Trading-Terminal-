# Pinned to a specific patch (INFRA-04); pin by digest in CI for full repro.
FROM python:3.11.9-slim
WORKDIR /app

COPY requirements.txt .
# Exact-version pinned for reproducible builds (DEP-01). For full supply-chain
# protection, generate a hash-pinned lockfile in CI and switch to:
#   pip-compile --generate-hashes requirements.in -o requirements.lock
#   pip install --require-hashes -r requirements.lock
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Non-root user for security
RUN addgroup --system --gid 1001 appgroup \
 && adduser  --system --uid 1001 --ingroup appgroup appuser \
 && mkdir -p /data \
 && chown -R appuser:appgroup /app /data

USER appuser

# Persist the SQLite database on a named volume (see docker-compose.yml).
# DB_PATH is set by docker-compose so the DB lands on the volume, not inside
# the container's filesystem where it would be lost on restart.
ENV PSX_DB_PATH=/data/psx_data.db

# Default: run the live scheduler (fetches at 16:00 PKT every day).
# Override CMD in docker-compose or with `docker run ... python3 main.py fetch`
# to run a one-off command instead.
CMD ["python3", "main.py"]
