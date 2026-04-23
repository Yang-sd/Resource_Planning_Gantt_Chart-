from __future__ import annotations


def test_health_and_bootstrap_returns_seed_data(client):
    health_response = client.get("/api/health")
    assert health_response.status_code == 200
    assert health_response.get_json() == {"status": "ok"}

    bootstrap_response = client.get("/api/bootstrap")
    assert bootstrap_response.status_code == 200
    payload = bootstrap_response.get_json()

    assert payload["summary"]["teamCount"] == 3
    assert payload["summary"]["memberCount"] == 4
    assert payload["summary"]["taskCount"] == 6
    assert len(payload["teams"]) == 3
    assert len(payload["members"]) == 4
    assert len(payload["tasks"]) == 6
    assert payload["tasks"][0]["startDate"] == "2026-04-21"


def test_create_update_delete_team_member_and_task_flow(client):
    create_team = client.post(
        "/api/teams",
        json={"name": "后端平台组", "lead": "周舟", "color": "#10b981"},
    )
    assert create_team.status_code == 201
    team_id = create_team.get_json()["item"]["id"]

    create_member = client.post(
        "/api/members",
        json={
            "name": "周舟",
            "role": "Python 工程师",
            "teamId": team_id,
            "avatar": "周",
            "capacityHours": 40,
        },
    )
    assert create_member.status_code == 201
    member_id = create_member.get_json()["item"]["id"]

    create_task = client.post(
        "/api/tasks",
        json={
            "title": "后端服务拆分",
            "ownerId": member_id,
            "progress": 10,
            "status": "计划中",
            "priority": "P1",
            "startDate": "2026-04-25",
            "duration": 5,
            "summary": "落地 Flask 和 MySQL 服务。",
            "milestone": "API 联调完成",
            "sortOrder": 0,
        },
    )
    assert create_task.status_code == 201
    task_payload = create_task.get_json()["item"]
    task_id = task_payload["id"]
    assert task_payload["teamId"] == team_id

    update_member = client.patch(
        f"/api/members/{member_id}",
        json={"teamId": "delivery", "role": "后端工程师"},
    )
    assert update_member.status_code == 200
    assert update_member.get_json()["item"]["teamId"] == "delivery"

    update_task = client.patch(
        f"/api/tasks/{task_id}",
        json={
            "progress": 60,
            "status": "进行中",
            "priority": "P0",
            "startDate": "2026-04-26",
            "duration": 8,
            "operationDetail": "已将项目整体平移到新的日期区间。",
        },
    )
    assert update_task.status_code == 200
    updated_task = update_task.get_json()["item"]
    assert updated_task["progress"] == 60
    assert updated_task["status"] == "进行中"
    assert updated_task["priority"] == "P0"
    assert updated_task["teamId"] == "delivery"

    delete_task = client.delete(f"/api/tasks/{task_id}")
    assert delete_task.status_code == 200

    delete_member = client.delete(f"/api/members/{member_id}")
    assert delete_member.status_code == 200

    delete_team = client.delete(f"/api/teams/{team_id}")
    assert delete_team.status_code == 200

    operation_records = client.get("/api/operation-records?page=1&size=50").get_json()["items"]
    assert any(item["action"] == "新增" and "团队 / 后端平台组" == item["target"] for item in operation_records)
    assert any(item["action"] == "删除" and "项目 / 后端服务拆分" == item["target"] for item in operation_records)


def test_delete_protection_and_conflict_messages(client):
    delete_team = client.delete("/api/teams/strategy")
    assert delete_team.status_code == 409
    assert "仍关联" in delete_team.get_json()["error"]

    delete_member = client.delete("/api/members/xuheng")
    assert delete_member.status_code == 409
    assert "仍负责" in delete_member.get_json()["error"]


def test_pagination_view_logging_and_export(client):
    view_response = client.post(
        "/api/operation-records/view",
        json={"target": "记录中心", "detail": "打开了更新记录页面。"},
    )
    assert view_response.status_code == 201
    assert view_response.get_json()["item"]["action"] == "查看"

    release_page = client.get("/api/release-records?page=1&size=5")
    assert release_page.status_code == 200
    release_payload = release_page.get_json()
    assert release_payload["page"] == 1
    assert release_payload["size"] == 5
    assert release_payload["total"] >= 12
    assert len(release_payload["items"]) == 5

    operation_page = client.get("/api/operation-records?page=1&size=2")
    assert operation_page.status_code == 200
    operation_payload = operation_page.get_json()
    assert operation_payload["page"] == 1
    assert operation_payload["size"] == 2
    assert operation_payload["total"] >= 2
    assert len(operation_payload["items"]) == 2

    export_response = client.get("/api/export/workspace")
    assert export_response.status_code == 200
    export_payload = export_response.get_json()
    assert len(export_payload["teams"]) == 3
    assert len(export_payload["members"]) == 4
    assert len(export_payload["tasks"]) == 6
    assert len(export_payload["updateRecords"]) >= 12
    assert any(item["action"] == "导出" for item in export_payload["operationRecords"])


def test_reorder_member_and_task_sort_orders(client):
    member_reorder = client.patch("/api/members/xuheng", json={"sortOrder": 0})
    assert member_reorder.status_code == 200

    members = client.get("/api/members").get_json()["items"]
    assert members[0]["id"] == "xuheng"

    task_reorder = client.patch(
        "/api/tasks/alpha",
        json={
            "sortOrder": 5,
            "operationDetail": "已调整项目在当前负责人名下的上下顺序。",
        },
    )
    assert task_reorder.status_code == 200

    tasks = client.get("/api/tasks").get_json()["items"]
    assert tasks[-1]["id"] == "alpha"
