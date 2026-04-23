from __future__ import annotations

from math import ceil

from flask import Response, jsonify, request

from ..extensions import db
from ..models import Member, OperationRecord, ReleaseRecord, Task, Team
from ..seed import seed_database
from ..serializers import (
    serialize_member,
    serialize_operation_record,
    serialize_release_record,
    serialize_task,
    serialize_team,
)
from ..services import (
    VALID_PRIORITIES,
    VALID_STATUSES,
    append_operation_record,
    generate_id,
    now_local,
    parse_date_value,
    parse_int_value,
    rebalance_sort_orders,
)
from . import api_blueprint


def _json_error(message: str, status_code: int) -> tuple[Response, int]:
    return jsonify({"error": message}), status_code


def _read_json_body() -> dict[str, object]:
    return request.get_json(silent=True) or {}


def _validate_task_payload(payload: dict[str, object], partial: bool = False) -> dict[str, object]:
    normalized: dict[str, object] = {}

    if not partial or "title" in payload:
        title = str(payload.get("title", "")).strip()
        if not title:
            raise ValueError("项目名称不能为空。")
        normalized["title"] = title

    if not partial or "ownerId" in payload:
        owner_id = str(payload.get("ownerId", "")).strip()
        if not owner_id:
            raise ValueError("负责人不能为空。")
        owner = db.session.get(Member, owner_id)
        if owner is None:
            raise ValueError("负责人不存在。")
        normalized["owner"] = owner

    if not partial or "progress" in payload:
        normalized["progress"] = parse_int_value(payload.get("progress"), "progress", 0, 100)

    if not partial or "status" in payload:
        status = str(payload.get("status", "")).strip()
        if status not in VALID_STATUSES:
            raise ValueError("状态不合法。")
        normalized["status"] = status

    if not partial or "priority" in payload:
        priority = str(payload.get("priority", "")).strip()
        if priority not in VALID_PRIORITIES:
            raise ValueError("优先级不合法。")
        normalized["priority"] = priority

    if not partial or "startDate" in payload:
        normalized["startDate"] = parse_date_value(payload.get("startDate"), "startDate")

    if not partial or "duration" in payload:
        normalized["duration"] = parse_int_value(payload.get("duration"), "duration", 1)

    if not partial or "summary" in payload:
        summary = str(payload.get("summary", "")).strip()
        if not summary:
            raise ValueError("项目摘要不能为空。")
        normalized["summary"] = summary

    if not partial or "milestone" in payload:
        milestone = str(payload.get("milestone", "")).strip()
        if not milestone:
            raise ValueError("里程碑不能为空。")
        normalized["milestone"] = milestone

    if "sortOrder" in payload:
        normalized["sortOrder"] = parse_int_value(payload.get("sortOrder"), "sortOrder", 0)

    return normalized


def _validate_team_payload(payload: dict[str, object], partial: bool = False) -> dict[str, str]:
    normalized: dict[str, str] = {}

    if not partial or "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("团队名称不能为空。")
        normalized["name"] = name

    if not partial or "lead" in payload:
        normalized["lead"] = str(payload.get("lead", "")).strip() or "待设置"

    if not partial or "color" in payload:
        color = str(payload.get("color", "")).strip()
        if not color:
            raise ValueError("团队颜色不能为空。")
        normalized["color"] = color

    return normalized


def _validate_member_payload(payload: dict[str, object], partial: bool = False) -> dict[str, object]:
    normalized: dict[str, object] = {}

    if not partial or "name" in payload:
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("成员姓名不能为空。")
        normalized["name"] = name

    if not partial or "role" in payload:
        role = str(payload.get("role", "")).strip()
        if not role:
            raise ValueError("成员角色不能为空。")
        normalized["role"] = role

    if not partial or "teamId" in payload:
        team_id = str(payload.get("teamId", "")).strip()
        if not team_id:
            raise ValueError("所属团队不能为空。")
        team = db.session.get(Team, team_id)
        if team is None:
            raise ValueError("所属团队不存在。")
        normalized["team"] = team

    if not partial or "avatar" in payload:
        avatar = str(payload.get("avatar", "")).strip()
        normalized["avatar"] = avatar or "新"

    if not partial or "capacityHours" in payload:
        normalized["capacityHours"] = parse_int_value(
            payload.get("capacityHours", 40),
            "capacityHours",
            1,
        )

    if "sortOrder" in payload:
        normalized["sortOrder"] = parse_int_value(payload.get("sortOrder"), "sortOrder", 0)

    return normalized


def _paginate(query, serializer, page: int, size: int) -> dict[str, object]:
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    return {
        "items": [serializer(item) for item in items],
        "page": page,
        "size": size,
        "total": total,
        "totalPages": max(1, ceil(total / size)) if size > 0 else 1,
    }


@api_blueprint.get("/health")
def health_check() -> Response:
    seed_database()
    return jsonify({"status": "ok"})


@api_blueprint.get("/bootstrap")
def bootstrap() -> Response:
    seed_database()
    teams = Team.query.order_by(Team.sort_order.asc(), Team.created_at.asc()).all()
    members = Member.query.order_by(Member.sort_order.asc(), Member.created_at.asc()).all()
    tasks = Task.query.order_by(Task.sort_order.asc(), Task.updated_at.desc()).all()
    return jsonify(
        {
            "teams": [serialize_team(team) for team in teams],
            "members": [serialize_member(member) for member in members],
            "tasks": [serialize_task(task) for task in tasks],
            "summary": {
                "teamCount": len(teams),
                "memberCount": len(members),
                "taskCount": len(tasks),
                "releaseRecordCount": ReleaseRecord.query.count(),
                "operationRecordCount": OperationRecord.query.count(),
                "generatedAt": now_local().strftime("%Y-%m-%dT%H:%M:%S"),
            },
        }
    )


@api_blueprint.get("/teams")
def list_teams() -> Response:
    teams = Team.query.order_by(Team.sort_order.asc(), Team.created_at.asc()).all()
    return jsonify({"items": [serialize_team(team) for team in teams]})


@api_blueprint.post("/teams")
def create_team() -> Response:
    payload = _read_json_body()

    try:
        normalized = _validate_team_payload(payload)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    duplicate = Team.query.filter(Team.name == normalized["name"]).first()
    if duplicate is not None:
        return _json_error("团队名称已存在。", 409)

    current_time = now_local()
    sort_order = Team.query.count()
    team = Team(
        id=generate_id("team"),
        name=normalized["name"],
        lead=normalized["lead"],
        color=normalized["color"],
        sort_order=sort_order,
        created_at=current_time,
        updated_at=current_time,
    )
    db.session.add(team)
    append_operation_record("新增", f"团队 / {team.name}", f"已创建团队，负责人为 {team.lead}。")
    db.session.commit()
    return jsonify({"item": serialize_team(team)}), 201


@api_blueprint.patch("/teams/<team_id>")
def update_team(team_id: str) -> Response:
    team = db.session.get(Team, team_id)
    if team is None:
        return _json_error("团队不存在。", 404)

    payload = _read_json_body()
    try:
        normalized = _validate_team_payload(payload, partial=True)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    if "name" in normalized:
        duplicate = Team.query.filter(Team.name == normalized["name"], Team.id != team_id).first()
        if duplicate is not None:
            return _json_error("团队名称已存在。", 409)
        team.name = normalized["name"]

    if "lead" in normalized:
        team.lead = normalized["lead"]

    if "color" in normalized:
        team.color = normalized["color"]

    team.updated_at = now_local()
    append_operation_record("修改", f"团队 / {team.name}", "已更新团队基础信息。")
    db.session.commit()
    return jsonify({"item": serialize_team(team)})


@api_blueprint.delete("/teams/<team_id>")
def delete_team(team_id: str) -> Response:
    team = db.session.get(Team, team_id)
    if team is None:
        return _json_error("团队不存在。", 404)

    member_count = Member.query.filter_by(team_id=team_id).count()
    task_count = Task.query.filter_by(team_id=team_id).count()
    if member_count > 0 or task_count > 0:
        return _json_error(
            f"团队“{team.name}”仍关联 {member_count} 名成员和 {task_count} 个项目，请先迁移或清理后再删除。",
            409,
        )

    append_operation_record("删除", f"团队 / {team.name}", "已从当前工作区移除团队。")
    db.session.delete(team)
    remaining_teams = Team.query.order_by(Team.sort_order.asc(), Team.created_at.asc()).all()
    for index, item in enumerate(remaining_teams):
        item.sort_order = index
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.get("/members")
def list_members() -> Response:
    members = Member.query.order_by(Member.sort_order.asc(), Member.created_at.asc()).all()
    return jsonify({"items": [serialize_member(member) for member in members]})


@api_blueprint.post("/members")
def create_member() -> Response:
    payload = _read_json_body()
    try:
        normalized = _validate_member_payload(payload)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    current_time = now_local()
    member = Member(
        id=generate_id("member"),
        name=str(normalized["name"]),
        role=str(normalized["role"]),
        team_id=normalized["team"].id,
        avatar=str(normalized["avatar"]),
        capacity_hours=int(normalized["capacityHours"]),
        sort_order=Member.query.count(),
        created_at=current_time,
        updated_at=current_time,
    )
    db.session.add(member)
    append_operation_record("新增", f"成员 / {member.name}", f"已加入 {normalized['team'].name}。")
    db.session.commit()
    return jsonify({"item": serialize_member(member)}), 201


@api_blueprint.patch("/members/<member_id>")
def update_member(member_id: str) -> Response:
    member = db.session.get(Member, member_id)
    if member is None:
        return _json_error("成员不存在。", 404)

    payload = _read_json_body()
    try:
        normalized = _validate_member_payload(payload, partial=True)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    previous_name = member.name

    if "name" in normalized:
        member.name = str(normalized["name"])
    if "role" in normalized:
        member.role = str(normalized["role"])
    if "team" in normalized:
        member.team_id = normalized["team"].id
        Task.query.filter_by(owner_id=member.id).update({"team_id": normalized["team"].id})
    if "avatar" in normalized:
        member.avatar = str(normalized["avatar"])
    if "capacityHours" in normalized:
        member.capacity_hours = int(normalized["capacityHours"])

    if "sortOrder" in normalized:
        members = Member.query.order_by(Member.sort_order.asc(), Member.created_at.asc()).all()
        rebalance_sort_orders(members, member, int(normalized["sortOrder"]))

    if previous_name != member.name:
        Team.query.filter(Team.lead == previous_name).update({"lead": member.name})

    member.updated_at = now_local()
    append_operation_record("修改", f"成员 / {member.name}", "已更新成员档案与团队归属。")
    db.session.commit()
    return jsonify({"item": serialize_member(member)})


@api_blueprint.delete("/members/<member_id>")
def delete_member(member_id: str) -> Response:
    member = db.session.get(Member, member_id)
    if member is None:
        return _json_error("成员不存在。", 404)

    owned_task_count = Task.query.filter_by(owner_id=member_id).count()
    if owned_task_count > 0:
        return _json_error(
            f"成员“{member.name}”仍负责 {owned_task_count} 个项目，请先转交或删除这些项目后再删除成员。",
            409,
        )

    Team.query.filter(Team.lead == member.name).update({"lead": "待设置"})
    append_operation_record("删除", f"成员 / {member.name}", "已从当前工作区移除成员。")
    db.session.delete(member)
    remaining_members = Member.query.order_by(Member.sort_order.asc(), Member.created_at.asc()).all()
    rebalance_sort_orders(remaining_members)
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.get("/tasks")
def list_tasks() -> Response:
    tasks = Task.query.order_by(Task.sort_order.asc(), Task.updated_at.desc()).all()
    return jsonify({"items": [serialize_task(task) for task in tasks]})


@api_blueprint.post("/tasks")
def create_task() -> Response:
    payload = _read_json_body()
    try:
        normalized = _validate_task_payload(payload)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    owner = normalized["owner"]
    current_time = now_local()
    task = Task(
        id=generate_id("task"),
        title=str(normalized["title"]),
        owner_id=owner.id,
        team_id=owner.team_id,
        progress=int(normalized["progress"]),
        status=str(normalized["status"]),
        priority=str(normalized["priority"]),
        start_date=normalized["startDate"],
        duration=int(normalized["duration"]),
        sort_order=Task.query.count(),
        summary=str(normalized["summary"]),
        milestone=str(normalized["milestone"]),
        created_at=current_time,
        updated_at=current_time,
    )

    db.session.add(task)
    db.session.flush()

    if "sortOrder" in normalized:
        tasks = Task.query.order_by(Task.sort_order.asc(), Task.created_at.asc()).all()
        rebalance_sort_orders(tasks, task, int(normalized["sortOrder"]))

    append_operation_record("新增", f"项目 / {task.title}", f"已将项目排期分配给 {owner.name}。")
    db.session.commit()
    return jsonify({"item": serialize_task(task)}), 201


@api_blueprint.patch("/tasks/<task_id>")
def update_task(task_id: str) -> Response:
    task = db.session.get(Task, task_id)
    if task is None:
        return _json_error("项目不存在。", 404)

    payload = _read_json_body()
    try:
        normalized = _validate_task_payload(payload, partial=True)
    except ValueError as exc:
        return _json_error(str(exc), 400)

    if "title" in normalized:
        task.title = str(normalized["title"])
    if "owner" in normalized:
        task.owner_id = normalized["owner"].id
        task.team_id = normalized["owner"].team_id
    if "progress" in normalized:
        task.progress = int(normalized["progress"])
    if "status" in normalized:
        task.status = str(normalized["status"])
    if "priority" in normalized:
        task.priority = str(normalized["priority"])
    if "startDate" in normalized:
        task.start_date = normalized["startDate"]
    if "duration" in normalized:
        task.duration = int(normalized["duration"])
    if "summary" in normalized:
        task.summary = str(normalized["summary"])
    if "milestone" in normalized:
        task.milestone = str(normalized["milestone"])
    if "sortOrder" in normalized:
        tasks = Task.query.order_by(Task.sort_order.asc(), Task.created_at.asc()).all()
        rebalance_sort_orders(tasks, task, int(normalized["sortOrder"]))

    task.updated_at = now_local()

    detail = str(payload.get("operationDetail", "")).strip() or "已保存项目排期与详情。"
    append_operation_record("修改", f"项目 / {task.title}", detail)
    db.session.commit()
    return jsonify({"item": serialize_task(task)})


@api_blueprint.delete("/tasks/<task_id>")
def delete_task(task_id: str) -> Response:
    task = db.session.get(Task, task_id)
    if task is None:
        return _json_error("项目不存在。", 404)

    append_operation_record("删除", f"项目 / {task.title}", f"已删除项目“{task.title}”。")
    db.session.delete(task)
    remaining_tasks = Task.query.order_by(Task.sort_order.asc(), Task.created_at.asc()).all()
    rebalance_sort_orders(remaining_tasks)
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.get("/release-records")
def list_release_records() -> Response:
    page = parse_int_value(request.args.get("page", 1), "page", 1)
    size = parse_int_value(request.args.get("size", 10), "size", 1, 100)
    query = ReleaseRecord.query.order_by(ReleaseRecord.updated_at.desc(), ReleaseRecord.version.desc())
    return jsonify(_paginate(query, serialize_release_record, page, size))


@api_blueprint.get("/operation-records")
def list_operation_records() -> Response:
    page = parse_int_value(request.args.get("page", 1), "page", 1)
    size = parse_int_value(request.args.get("size", 10), "size", 1, 100)
    query = OperationRecord.query.order_by(OperationRecord.created_at.desc(), OperationRecord.id.desc())
    return jsonify(_paginate(query, serialize_operation_record, page, size))


@api_blueprint.post("/operation-records/view")
def create_view_operation_record() -> Response:
    payload = _read_json_body()
    target = str(payload.get("target", "")).strip()
    detail = str(payload.get("detail", "")).strip()
    actor = str(payload.get("actor", "")).strip() or "当前用户"

    if not target or not detail:
        return _json_error("target 和 detail 不能为空。", 400)

    record = append_operation_record("查看", target, detail, actor)
    db.session.commit()
    return jsonify({"item": serialize_operation_record(record)}), 201


@api_blueprint.get("/export/workspace")
def export_workspace() -> Response:
    append_operation_record("导出", "工作区 JSON", "已导出当前数据库中的工作区数据。")
    db.session.flush()
    teams = Team.query.order_by(Team.sort_order.asc(), Team.created_at.asc()).all()
    members = Member.query.order_by(Member.sort_order.asc(), Member.created_at.asc()).all()
    tasks = Task.query.order_by(Task.sort_order.asc(), Task.updated_at.desc()).all()
    update_records = ReleaseRecord.query.order_by(ReleaseRecord.updated_at.desc()).all()
    operation_records = OperationRecord.query.order_by(OperationRecord.created_at.desc()).all()
    db.session.commit()
    return jsonify(
        {
            "teams": [serialize_team(team) for team in teams],
            "members": [serialize_member(member) for member in members],
            "tasks": [serialize_task(task) for task in tasks],
            "updateRecords": [serialize_release_record(record) for record in update_records],
            "operationRecords": [serialize_operation_record(record) for record in operation_records],
        }
    )
