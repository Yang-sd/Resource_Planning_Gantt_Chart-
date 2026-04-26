#!/usr/bin/env bash
set -euo pipefail

# Stop and remove the all-in-one local container.
# Pass --purge-data to also delete the local MySQL data volume.

PURGE_DATA="${1:-}"
CONTAINER_NAME="${CONTAINER_NAME:-resource-planning-single}"
DATA_VOLUME="${DATA_VOLUME:-resource-planning-single-data}"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

if [ "$PURGE_DATA" = "--purge-data" ]; then
  docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || true
fi

echo "单容器部署已停止。"
