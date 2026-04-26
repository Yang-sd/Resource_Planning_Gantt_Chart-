#!/usr/bin/env bash
set -euo pipefail

# Stop and remove local Resource Planning containers.
#
# Default behavior is intentionally conservative: containers and the temporary
# Docker network are removed, but the MySQL volume is kept so local data survives.
# Pass `--purge-data` only when you explicitly want a clean database reset.

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
  # This deletes all local MySQL data for this project.
  docker volume rm "$MYSQL_VOLUME" >/dev/null 2>&1 || true
fi

echo "本地容器已停止。"
