#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT_DIR/run/gunicorn.pid"

if [ ! -f "$PID_FILE" ]; then
  exit 0
fi

PID="$(cat "$PID_FILE")"
if [ -n "$PID" ] && kill -0 "$PID" >/dev/null 2>&1; then
  kill "$PID"
  for _ in $(seq 1 20); do
    if ! kill -0 "$PID" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done

  if kill -0 "$PID" >/dev/null 2>&1; then
    kill -9 "$PID" >/dev/null 2>&1 || true
  fi
fi

rm -f "$PID_FILE"
