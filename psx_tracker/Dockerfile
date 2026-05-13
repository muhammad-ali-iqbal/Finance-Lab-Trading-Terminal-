FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persist the SQLite database on a named volume (see docker-compose.yml).
# DB_PATH is set by docker-compose so the DB lands on the volume, not inside
# the container's filesystem where it would be lost on restart.
ENV PSX_DB_PATH=/data/psx_data.db
RUN mkdir -p /data

# Default: run the live scheduler (fetches at 16:00 PKT every day).
# Override CMD in docker-compose or with `docker run ... python3 main.py fetch`
# to run a one-off command instead.
CMD ["python3", "main.py"]
