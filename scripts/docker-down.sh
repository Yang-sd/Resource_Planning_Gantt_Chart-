#!/usr/bin/env bash
set -euo pipefail

PURGE_DATA="${1:-}"
NETWORK_NAME="resource-planning-net"
MYSQL_CONTAINER="resource-planning-mysql"
API_CONTAINER="resource-planning-api"
WEB_CONTAINER="resource-planning-web"
MYSQL_VOLUME="resource-planning-mysql-data"
LEGACY_WEB_CONTAINER="human-gantt-workbench-app"

docker rm -f "$WEB_CONTAINER" "$API_CONTAINER" "$MYSQL_CONTAINER" "$LEGACY_WEB_CONTAINER" >/dev/null 2>&1 || true
docker network rm "$NETWORK_NAME" >/dev/null 2>&1 || true

if [ "$PURGE_DATA" = "--purge-data" ]; then
  docker volume rm "$MYSQL_VOLUME" >/dev/null 2>&1 || true
fi

echo "本地容器已停止。"
