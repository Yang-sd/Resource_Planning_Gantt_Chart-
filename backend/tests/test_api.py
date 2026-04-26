from __future__ import annotations

import base64


TINY_GIF_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAAAAACw="


def _auth_headers(client, username: str = "admin", password: str = "admin") -> dict[str, str]:
    login_response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert login_response.status_code == 200
    token = login_response.get_json()["token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_and_bootstrap_returns_seed_data(client):
    """Smoke-test the cold-start path used by Docker health checks and the SPA."""

    health_response = client.get("/api/health")
    assert health_response.status_code == 200
    assert health_response.get_json() == {"status": "ok"}

    unauthenticated_bootstrap = client.get("/api/bootstrap")
    assert unauthenticated_bootstrap.status_code == 401

    headers = _auth_headers(client)
    bootstrap_response = client.get("/api/bootstrap", headers=headers)
    assert bootstrap_response.status_code == 200
    payload = bootstrap_response.get_json()

    assert payload["summary"]["teamCount"] == 3
    assert payload["summary"]["memberCount"] == 4
    assert payload["summary"]["taskCount"] == 6
    assert len(payload["teams"]) == 3
    assert len(payload["members"]) == 4
    assert len(payload["tasks"]) == 6
    assert payload["tasks"][0]["startDate"] == "2026-04-21"

    me_response = client.get("/api/auth/me", headers=headers)
    assert me_response.status_code == 200
    account = me_response.get_json()["account"]
    assert account["username"] == "admin"
    assert account["permissions"]["canManageOrganization"] is True


def test_create_update_delete_team_member_and_task_flow(client):
    """Cover the main CRUD workflow that powers the local management screens."""

    headers = _auth_headers(client)
    create_team = client.post(
        "/api/teams",
        json={"name": "后端平台组", "lead": "周舟", "color": "#10b981"},
        headers=headers,
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
        headers=headers,
    )
    assert create_member.status_code == 201
    create_member_payload = create_member.get_json()
    member_id = create_member_payload["item"]["id"]
    assert create_member_payload["accountUsername"] == "周舟"
    assert create_member_payload["defaultPassword"] == "123456"

    new_member_headers = _auth_headers(client, "周舟", "123456")
    new_member_me = client.get("/api/auth/me", headers=new_member_headers)
    assert new_member_me.status_code == 200
    assert new_member_me.get_json()["account"]["memberId"] == member_id

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
        headers=headers,
    )
    assert create_task.status_code == 201
    task_payload = create_task.get_json()["item"]
    task_id = task_payload["id"]
    assert task_payload["teamId"] == team_id

    update_member = client.patch(
        f"/api/members/{member_id}",
        json={"teamId": "delivery", "role": "后端工程师"},
        headers=headers,
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
        headers=headers,
    )
    assert update_task.status_code == 200
    updated_task = update_task.get_json()["item"]
    assert updated_task["progress"] == 60
    assert updated_task["status"] == "进行中"
    assert updated_task["priority"] == "P0"
    assert updated_task["teamId"] == "delivery"

    delete_task = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert delete_task.status_code == 200

    delete_member = client.delete(f"/api/members/{member_id}", headers=headers)
    assert delete_member.status_code == 200

    delete_team = client.delete(f"/api/teams/{team_id}", headers=headers)
    assert delete_team.status_code == 200

    operation_records = client.get("/api/operation-records?page=1&size=50", headers=headers).get_json()["items"]
    assert any(item["action"] == "新增" and "团队 / 后端平台组" == item["target"] for item in operation_records)
    assert any(item["action"] == "删除" and "项目 / 后端服务拆分" == item["target"] for item in operation_records)


def test_delete_protection_and_conflict_messages(client):
    """Deletion must stay safe even when the resource graph is still linked."""

    headers = _auth_headers(client)
    delete_team = client.delete("/api/teams/strategy", headers=headers)
    assert delete_team.status_code == 409
    assert "仍关联" in delete_team.get_json()["error"]

    delete_member = client.delete("/api/members/xuheng", headers=headers)
    assert delete_member.status_code == 409
    assert "仍负责" in delete_member.get_json()["error"]


def test_pagination_view_logging_and_export(client):
    """Record center endpoints should stay paginated and keep audit history intact."""

    headers = _auth_headers(client)
    view_response = client.post(
        "/api/operation-records/view",
        json={"target": "记录中心", "detail": "打开了更新记录页面。"},
        headers=headers,
    )
    assert view_response.status_code == 201
    assert view_response.get_json()["item"]["action"] == "查看"

    release_page = client.get("/api/release-records?page=1&size=5", headers=headers)
    assert release_page.status_code == 200
    release_payload = release_page.get_json()
    assert release_payload["page"] == 1
    assert release_payload["size"] == 5
    assert release_payload["total"] >= 14
    assert len(release_payload["items"]) == 5

    operation_page = client.get("/api/operation-records?page=1&size=2", headers=headers)
    assert operation_page.status_code == 200
    operation_payload = operation_page.get_json()
    assert operation_payload["page"] == 1
    assert operation_payload["size"] == 2
    assert operation_payload["total"] >= 2
    assert len(operation_payload["items"]) == 2

    export_response = client.get("/api/export/workspace", headers=headers)
    assert export_response.status_code == 200
    export_payload = export_response.get_json()
    assert len(export_payload["teams"]) == 3
    assert len(export_payload["members"]) == 4
    assert len(export_payload["tasks"]) == 6
    assert len(export_payload["updateRecords"]) >= 14
    assert any(item["action"] == "导出" for item in export_payload["operationRecords"])


def test_reorder_member_and_task_sort_orders(client):
    """Drag-reorder operations should persist stable dense sort orders."""

    headers = _auth_headers(client)
    member_reorder = client.patch("/api/members/xuheng", json={"sortOrder": 0}, headers=headers)
    assert member_reorder.status_code == 200

    members = client.get("/api/members", headers=headers).get_json()["items"]
    assert members[0]["id"] == "xuheng"

    task_reorder = client.patch(
        "/api/tasks/alpha",
        json={
            "sortOrder": 5,
            "operationDetail": "已调整项目在当前负责人名下的上下顺序。",
        },
        headers=headers,
    )
    assert task_reorder.status_code == 200

    tasks = client.get("/api/tasks", headers=headers).get_json()["items"]
    assert tasks[-1]["id"] == "alpha"


def test_member_and_team_lead_permissions(client):
    """Organization management is hidden in the UI and blocked in the API."""

    member_headers = _auth_headers(client, "mina", "123456")
    member_me = client.get("/api/auth/me", headers=member_headers)
    assert member_me.status_code == 200
    assert member_me.get_json()["account"]["permissions"]["canManageOrganization"] is False

    denied_team_create = client.post(
        "/api/teams",
        json={"name": "普通成员不可建组", "lead": "米娜", "color": "#f97316"},
        headers=member_headers,
    )
    assert denied_team_create.status_code == 403

    allowed_task_update = client.patch(
        "/api/tasks/zeta",
        json={"progress": 28, "operationDetail": "普通成员更新了自己关注的排期进度。"},
        headers=member_headers,
    )
    assert allowed_task_update.status_code == 200

    lead_headers = _auth_headers(client, "linqing", "123456")
    lead_me = client.get("/api/auth/me", headers=lead_headers)
    assert lead_me.status_code == 200
    assert lead_me.get_json()["account"]["permissions"]["canManageOrganization"] is True

    allowed_team_create = client.post(
        "/api/teams",
        json={"name": "负责人验证组", "lead": "林青", "color": "#6366f1"},
        headers=lead_headers,
    )
    assert allowed_team_create.status_code == 201


def test_current_account_profile_and_password_update(client):
    """Users can edit their own profile, password and uploaded avatar image."""

    headers = _auth_headers(client, "mina", "123456")

    profile_response = client.patch(
        "/api/auth/profile",
        json={
            "displayName": "米娜新",
            "avatar": "新",
            "avatarImage": TINY_GIF_DATA_URL,
            "newPassword": "654321",
        },
        headers=headers,
    )
    assert profile_response.status_code == 200
    account = profile_response.get_json()["account"]
    assert account["displayName"] == "米娜新"
    assert account["avatar"] == "新"
    assert account["avatarImageUrl"].startswith("/api/members/mina/avatar")

    avatar_response = client.get(account["avatarImageUrl"])
    assert avatar_response.status_code == 200
    assert avatar_response.content_type == "image/gif"

    old_password_login = client.post("/api/auth/login", json={"username": "mina", "password": "123456"})
    assert old_password_login.status_code == 401

    new_password_headers = _auth_headers(client, "mina", "654321")
    bootstrap_response = client.get("/api/bootstrap", headers=new_password_headers)
    assert bootstrap_response.status_code == 200
    members = bootstrap_response.get_json()["members"]
    mina = next(member for member in members if member["id"] == "mina")
    assert mina["name"] == "米娜新"
    assert mina["avatar"] == "新"
    assert mina["avatarImageUrl"].startswith("/api/members/mina/avatar")

    remove_avatar_response = client.patch(
        "/api/auth/profile",
        json={"displayName": "米娜新", "avatar": "新", "avatarImage": None},
        headers=new_password_headers,
    )
    assert remove_avatar_response.status_code == 200
    assert remove_avatar_response.get_json()["account"]["avatarImageUrl"] is None

    oversized_data_url = "data:image/png;base64," + base64.b64encode(
        b"x" * (10 * 1024 * 1024 + 1)
    ).decode("ascii")
    oversized_avatar_response = client.patch(
        "/api/auth/profile",
        json={"displayName": "米娜新", "avatar": "新", "avatarImage": oversized_data_url},
        headers=new_password_headers,
    )
    assert oversized_avatar_response.status_code == 400
