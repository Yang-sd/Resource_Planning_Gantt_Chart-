#!/usr/bin/env bash
set -euo pipefail

# Build and run the all-in-one image locally.
#
# This mode is optimized for the fastest user deployment experience: one image,
# one container, one exposed web port. The MySQL data directory is still mounted
# to a named volume so restarting the container does not erase business data.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-resource-planning-all-in-one:latest}"
CONTAINER_NAME="${CONTAINER_NAME:-resource-planning-single}"
DATA_VOLUME="${DATA_VOLUME:-resource-planning-single-data}"
WEB_PORT="${WEB_PORT:-8080}"

docker volume inspect "$DATA_VOLUME" >/dev/null 2>&1 || docker volume create "$DATA_VOLUME" >/dev/null
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile.all-in-one" "$ROOT_DIR"

docker run -d \
  --name "$CONTAINER_NAME" \
  -p "$WEB_PORT:8080" \
  -v "$DATA_VOLUME:/var/lib/mysql" \
  -e APP_TIMEZONE="${APP_TIMEZONE:-Asia/Shanghai}" \
  -e SECRET_KEY="${SECRET_KEY:-resource-planning-single-container-secret}" \
  -e MYSQL_DATABASE="${MYSQL_DATABASE:-resource_planning}" \
  -e MYSQL_USER="${MYSQL_USER:-resource_planning}" \
  -e MYSQL_PASSWORD="${MYSQL_PASSWORD:-resource_planning}" \
  -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}" \
  "$IMAGE_NAME" >/dev/null

echo "单容器部署已启动: http://127.0.0.1:$WEB_PORT"
echo "容器名称: $CONTAINER_NAME"
echo "数据卷: $DATA_VOLUME"
