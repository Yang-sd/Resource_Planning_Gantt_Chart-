#!/usr/bin/env bash
set -euo pipefail

# Smoke test for the all-in-one image.
#
# It builds the single image, starts one container, waits for the app health
# endpoint, then verifies login and bootstrap through the public web port.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WEB_PORT="${WEB_PORT:-8082}"
CONTAINER_NAME="${CONTAINER_NAME:-resource-planning-single-smoke}"
DATA_VOLUME="${DATA_VOLUME:-resource-planning-single-smoke-data}"
IMAGE_NAME="${IMAGE_NAME:-resource-planning-all-in-one:smoke}"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

CONTAINER_NAME="$CONTAINER_NAME" DATA_VOLUME="$DATA_VOLUME" WEB_PORT="$WEB_PORT" IMAGE_NAME="$IMAGE_NAME" \
  bash "$ROOT_DIR/scripts/docker-single-up.sh"

WEB_PORT="$WEB_PORT" python3 <<'PY'
import json
import os
import time
import urllib.request

WEB_PORT = os.environ["WEB_PORT"]
TOKEN = None


def request(path: str, method: str = "GET", data=None, auth: bool = True):
    payload = None
    headers = {}
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if TOKEN and auth:
        headers["Authorization"] = f"Bearer {TOKEN}"
    req = urllib.request.Request(
        f"http://127.0.0.1:{WEB_PORT}{path}",
        data=payload,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        body = response.read()
        if "application/json" in response.headers.get("Content-Type", ""):
            return json.loads(body.decode("utf-8"))
        return body.decode("utf-8")


for _ in range(90):
    try:
        if request("/api/health").get("status") == "ok":
            break
    except Exception:
        time.sleep(2)
else:
    raise SystemExit("单容器健康检查未通过")

html = request("/")
if 'id="root"' not in html:
    raise SystemExit("单容器前端首页异常")

login = request(
    "/api/auth/login",
    method="POST",
    data={"username": "admin", "password": "admin"},
    auth=False,
)
TOKEN = login["token"]

bootstrap = request("/api/bootstrap")
if bootstrap["summary"]["taskCount"] < 1:
    raise SystemExit("单容器 bootstrap 数据异常")

print("Single-container smoke test passed.")
PY
