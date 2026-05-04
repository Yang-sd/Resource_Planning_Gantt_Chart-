#!/usr/bin/env bash
set -euo pipefail

# Lightweight Synology NAS launcher.
#
# This mode intentionally avoids Docker and Nginx. It runs one gunicorn process
# and reads DATABASE_URL from .env, so multiple NAS projects can share one local
# PostgreSQL/MariaDB service while keeping their databases isolated. If no
# DATABASE_URL is configured, it falls back to a project-local SQLite file for
# quick local smoke tests.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8091}"
WEB_WORKERS="${WEB_WORKERS:-1}"
WEB_THREADS="${WEB_THREADS:-4}"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

mkdir -p "$ROOT_DIR/data" "$ROOT_DIR/logs" "$ROOT_DIR/run"

export APP_TIMEZONE="${APP_TIMEZONE:-Asia/Shanghai}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///$ROOT_DIR/data/resource-planning-gantt.db}"
export FRONTEND_DIST_DIR="${FRONTEND_DIST_DIR:-$ROOT_DIR/dist}"
export PYTHONPATH="$ROOT_DIR"
export SECRET_KEY="${SECRET_KEY:-resource-planning-nas-local-secret}"

"$ROOT_DIR/scripts/nas-lite-stop.sh" >/dev/null 2>&1 || true
"$ROOT_DIR/venv/bin/python" -m backend.manage init-db

nohup "$ROOT_DIR/venv/bin/gunicorn" \
  --bind "0.0.0.0:$PORT" \
  --workers "$WEB_WORKERS" \
  --threads "$WEB_THREADS" \
  --timeout 120 \
  --access-logfile "$ROOT_DIR/logs/access.log" \
  --error-logfile "$ROOT_DIR/logs/error.log" \
  backend.wsgi:app \
  >"$ROOT_DIR/logs/gunicorn.nohup.log" 2>&1 &

echo "$!" > "$ROOT_DIR/run/gunicorn.pid"
echo "Resource Planning Gantt is running at http://127.0.0.1:$PORT"
