#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NETWORK_NAME="resource-planning-net"
MYSQL_CONTAINER="resource-planning-mysql"
API_CONTAINER="resource-planning-api"
WEB_CONTAINER="resource-planning-web"
MYSQL_VOLUME="resource-planning-mysql-data"
WEB_IMAGE="resource-planning-web:latest"
API_IMAGE="resource-planning-api:latest"
LEGACY_WEB_CONTAINER="human-gantt-workbench-app"

wait_for_health() {
  local container_name="$1"
  local retries="${2:-60}"
  local delay_seconds="${3:-2}"

  for _ in $(seq 1 "$retries"); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$container_name" 2>/dev/null || true)"
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      return 0
    fi
    sleep "$delay_seconds"
  done

  echo "容器 $container_name 未在预期时间内就绪。" >&2
  docker logs "$container_name" || true
  return 1
}

docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 || docker network create "$NETWORK_NAME" >/dev/null
docker volume inspect "$MYSQL_VOLUME" >/dev/null 2>&1 || docker volume create "$MYSQL_VOLUME" >/dev/null

docker rm -f "$WEB_CONTAINER" "$API_CONTAINER" "$MYSQL_CONTAINER" "$LEGACY_WEB_CONTAINER" >/dev/null 2>&1 || true

docker build -t "$WEB_IMAGE" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"
docker build -t "$API_IMAGE" -f "$ROOT_DIR/backend/Dockerfile" "$ROOT_DIR"

docker run -d \
  --name "$MYSQL_CONTAINER" \
  --network "$NETWORK_NAME" \
  --network-alias mysql \
  -p 3306:3306 \
  -e MYSQL_DATABASE=resource_planning \
  -e MYSQL_USER=resource_planning \
  -e MYSQL_PASSWORD=resource_planning \
  -e MYSQL_ROOT_PASSWORD=root \
  --health-cmd="mysqladmin ping -h 127.0.0.1 -uroot -proot" \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=20 \
  -v "$MYSQL_VOLUME:/var/lib/mysql" \
  mysql:8.0 \
  --default-authentication-plugin=mysql_native_password

wait_for_health "$MYSQL_CONTAINER" 60 2

docker run -d \
  --name "$API_CONTAINER" \
  --network "$NETWORK_NAME" \
  --network-alias api \
  -p 8000:8000 \
  -e DATABASE_URL='mysql+pymysql://resource_planning:resource_planning@mysql:3306/resource_planning?charset=utf8mb4' \
  -e APP_TIMEZONE=Asia/Shanghai \
  --health-cmd="python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()\"" \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=15 \
  "$API_IMAGE"

wait_for_health "$API_CONTAINER" 60 2

docker run -d \
  --name "$WEB_CONTAINER" \
  --network "$NETWORK_NAME" \
  -p 8080:8080 \
  --health-cmd="wget -q -O- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1" \
  --health-interval=10s \
  --health-timeout=5s \
  --health-retries=10 \
  "$WEB_IMAGE"

wait_for_health "$WEB_CONTAINER" 60 2

echo "前端: http://127.0.0.1:8080"
echo "后端: http://127.0.0.1:8000/api/health"
echo "MySQL: 127.0.0.1:3306"
