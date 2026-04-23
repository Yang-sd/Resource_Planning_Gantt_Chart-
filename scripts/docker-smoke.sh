#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

bash "$ROOT_DIR/scripts/docker-up.sh"

python3 <<'PY'
import json
import sys
import time
import urllib.error
import urllib.request


def request(url: str, method: str = "GET", data=None):
    payload = None
    headers = {}
    if data is not None:
        payload = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as response:
        body = response.read()
        content_type = response.headers.get("Content-Type", "")
        if "application/json" in content_type:
            return json.loads(body.decode("utf-8"))
        return body.decode("utf-8")


for _ in range(30):
    try:
        health = request("http://127.0.0.1:8000/api/health")
        if health.get("status") == "ok":
            break
    except Exception:
        time.sleep(1)
else:
    raise SystemExit("API 健康检查未通过")

html = request("http://127.0.0.1:8080/")
if 'id="root"' not in html:
    raise SystemExit("前端首页未返回预期内容")

proxied_health = request("http://127.0.0.1:8080/api/health")
if proxied_health.get("status") != "ok":
    raise SystemExit("前端反向代理到 API 的链路异常")

bootstrap = request("http://127.0.0.1:8000/api/bootstrap")
if bootstrap["summary"]["teamCount"] < 3:
    raise SystemExit("Bootstrap 返回的团队数量异常")

team = request(
    "http://127.0.0.1:8000/api/teams",
    method="POST",
    data={"name": "冒烟验证组", "lead": "测试同学", "color": "#14b8a6"},
)
team_id = team["item"]["id"]

member = request(
    "http://127.0.0.1:8000/api/members",
    method="POST",
    data={
        "name": "测试同学",
        "role": "测试工程师",
        "teamId": team_id,
        "avatar": "测",
        "capacityHours": 40,
    },
)
member_id = member["item"]["id"]

task = request(
    "http://127.0.0.1:8000/api/tasks",
    method="POST",
    data={
        "title": "容器冒烟验证",
        "ownerId": member_id,
        "progress": 20,
        "status": "计划中",
        "priority": "P2",
        "startDate": "2026-04-23",
        "duration": 4,
        "summary": "验证三容器栈 CRUD 与导出链路。",
        "milestone": "冒烟通过",
    },
)
task_id = task["item"]["id"]

request(
    f"http://127.0.0.1:8000/api/tasks/{task_id}",
    method="PATCH",
    data={
        "progress": 60,
        "status": "进行中",
        "duration": 6,
        "operationDetail": "冒烟脚本已更新任务排期。",
    },
)

records = request("http://127.0.0.1:8000/api/operation-records?page=1&size=20")
if records["total"] < 4:
    raise SystemExit("操作记录数量异常")

export_payload = request("http://127.0.0.1:8000/api/export/workspace")
if not any(item["id"] == task_id for item in export_payload["tasks"]):
    raise SystemExit("导出快照缺少新建任务")

request(f"http://127.0.0.1:8000/api/tasks/{task_id}", method="DELETE")
request(f"http://127.0.0.1:8000/api/members/{member_id}", method="DELETE")
request(f"http://127.0.0.1:8000/api/teams/{team_id}", method="DELETE")

print("Docker smoke test passed.")
PY
