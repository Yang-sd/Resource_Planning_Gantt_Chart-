from __future__ import annotations

import base64
import binascii
from functools import wraps
from math import ceil
import re

from flask import Response, current_app, g, jsonify, request
from sqlalchemy import func, select
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db
from ..models import Account, Member, OperationRecord, ReleaseRecord, Task, Team
from ..seed import seed_database
from ..serializers import (
    serialize_account,
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
    count_rows,
    generate_id,
    next_sort_order,
    now_local,
    parse_date_value,
    parse_int_value,
    rebalance_sort_orders,
)
from . import api_blueprint


ALLOWED_AVATAR_MIME_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
AVATAR_DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL)


def _json_error(message: str, status_code: int) -> tuple[Response, int]:
    return jsonify({"error": message}), status_code


def _read_json_body() -> dict[str, object]:
    """Return a safe JSON payload even when the request body is empty."""

    return request.get_json(silent=True) or {}


def _token_serializer() -> URLSafeTimedSerializer:
    """Return the signed-token serializer used by the lightweight SPA login."""

    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="resource-planning-auth")


def _issue_auth_token(account: Account) -> str:
    """Create a browser-safe bearer token that stores only the account id."""

    return _token_serializer().dumps({"accountId": account.id})


def _read_bearer_token() -> str:
    """Read the auth token from Authorization or a fallback header."""

    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Bearer "):
        return authorization.removeprefix("Bearer ").strip()
    return request.headers.get("X-Auth-Token", "").strip()


def _load_current_account() -> Account | None:
    """Resolve the signed bearer token into an active account row."""

    if hasattr(g, "current_account"):
        return g.current_account

    token = _read_bearer_token()
    if not token:
        g.current_account = None
        return None

    try:
        payload = _token_serializer().loads(
            token,
            max_age=int(current_app.config["AUTH_TOKEN_MAX_AGE_SECONDS"]),
        )
    except (BadSignature, SignatureExpired):
        g.current_account = None
        return None

    account_id = str(payload.get("accountId", "")).strip()
    account = db.session.get(Account, account_id) if account_id else None
    if account is None or not account.is_active:
        g.current_account = None
        return None

    g.current_account = account
    return account


def _account_can_manage_organization(account: Account) -> bool:
    """Only admins and real team leads can access organization management."""

    if account.role == "admin":
        return True

    if account.member is None:
        return False

    lead_count = db.session.scalar(
        select(func.count()).select_from(Team).where(Team.lead == account.member.name)
    )
    return int(lead_count or 0) > 0


def _serialize_current_account(account: Account) -> dict[str, object]:
    return serialize_account(account, _account_can_manage_organization(account))


def _actor_label(account: Account | None = None) -> str:
    """Return the human-readable actor name used in operation records."""

    resolved_account = account or _load_current_account()
    if resolved_account is None:
        return "当前用户"
    if resolved_account.member is not None:
        return resolved_account.member.name
    if resolved_account.display_name:
        return resolved_account.display_name
    if resolved_account.role == "admin":
        return "管理员"
    return resolved_account.username


def _normalize_avatar(value: object, fallback_name: str) -> str:
    """Keep avatar text compact because current UI renders it inside circles."""

    avatar = str(value or "").strip()
    if avatar:
        return avatar[:2]
    return (fallback_name.strip()[:1] or "用")[:2]


def _normalize_avatar_image(value: object) -> tuple[str, str] | None:
    """Validate a browser data URL and return MIME plus sanitized base64 data.

    The API keeps uploaded avatars in MySQL so Docker restarts preserve user
    profile images. We store only the base64 payload and serve it through a
    separate image endpoint to avoid bloating normal bootstrap JSON responses.
    """

    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("头像文件格式不正确，请重新选择图片。")

    image_value = value.strip()
    if not image_value:
        return None

    match = AVATAR_DATA_URL_PATTERN.match(image_value)
    if match is None:
        raise ValueError("头像文件格式不正确，请上传图片或 GIF。")

    mime_type = match.group("mime").lower()
    if mime_type == "image/jpg":
        mime_type = "image/jpeg"
    if mime_type not in ALLOWED_AVATAR_MIME_TYPES:
        raise ValueError("头像仅支持 PNG、JPG、WebP 或 GIF。")

    raw_base64 = match.group("data")
    max_bytes = int(current_app.config["AVATAR_UPLOAD_MAX_BYTES"])
    if len(raw_base64) > ceil(max_bytes / 3) * 4 + 8:
        raise ValueError("头像文件不能超过 10MB。")

    try:
        decoded = base64.b64decode(raw_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("头像文件解析失败，请重新选择图片。") from exc

    if len(decoded) > max_bytes:
        raise ValueError("头像文件不能超过 10MB。")

    sanitized_base64 = base64.b64encode(decoded).decode("ascii")
    return mime_type, sanitized_base64


def _build_avatar_response(mime_type: str | None, image_data: str | None, updated_at) -> Response | tuple[Response, int]:
    """Serve uploaded avatar bytes with browser caching enabled."""

    if not mime_type or not image_data:
        return _json_error("头像不存在。", 404)

    try:
        image_bytes = base64.b64decode(image_data, validate=True)
    except (binascii.Error, ValueError):
        return _json_error("头像数据不可用。", 404)

    response = Response(image_bytes, mimetype=mime_type)
    response.cache_control.public = True
    response.cache_control.max_age = 60 * 60 * 24
    response.set_etag(f"{len(image_data)}-{int(updated_at.timestamp())}")
    return response.make_conditional(request)


def _generate_unique_username(preferred_name: str, fallback: str) -> str:
    """Create a readable login username for newly created members."""

    base_username = str(preferred_name or "").strip() or fallback
    base_username = base_username.replace(" ", "")
    base_username = base_username[:70] or fallback[:70] or "user"
    username = base_username
    suffix = 1

    while Account.query.filter(Account.username == username).first() is not None:
        suffix += 1
        username = f"{base_username[:64]}{suffix}"

    return username


def _create_member_account(member: Member) -> Account:
    """Create the default login account that belongs to a new member."""

    account = Account(
        id=generate_id("account"),
        username=_generate_unique_username(member.name, member.id),
        password_hash=generate_password_hash("123456", method="pbkdf2:sha256"),
        role="member",
        display_name=None,
        avatar=None,
        member_id=member.id,
        is_active=True,
        created_at=now_local(),
        updated_at=now_local(),
    )
    db.session.add(account)
    return account


def _require_account(view_func):
    """Reject unauthenticated API calls before they touch business data."""

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        account = _load_current_account()
        if account is None:
            return _json_error("请先登录。", 401)
        return view_func(*args, **kwargs)

    return wrapper


def _require_org_manager(view_func):
    """Limit organization writes to admins and team leads."""

    @wraps(view_func)
    def wrapper(*args, **kwargs):
        account = _load_current_account()
        if account is None:
            return _json_error("请先登录。", 401)
        if not _account_can_manage_organization(account):
            return _json_error("当前账号没有组织管理权限，请联系管理员或团队负责人。", 403)
        return view_func(*args, **kwargs)

    return wrapper


def _ordered_teams_query():
    """Centralize the default team ordering used across the API."""

    return Team.query.order_by(Team.sort_order.asc(), Team.created_at.asc())


def _ordered_members_query():
    """Centralize the default member ordering used across the API."""

    return Member.query.order_by(Member.sort_order.asc(), Member.created_at.asc())


def _ordered_tasks_query():
    """Centralize the default task ordering used across the API."""

    return Task.query.order_by(Task.sort_order.asc(), Task.updated_at.desc())


def _count_by_column(model, column, value: object) -> int:
    """Count rows with a direct aggregate instead of `Query.count()`.

    This helper is used on delete-protection paths where we only need a number
    and do not want to instantiate ORM rows.
    """

    count_value = db.session.scalar(select(func.count()).select_from(model).where(column == value))
    return int(count_value or 0)


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
        normalized["avatar"] = _normalize_avatar(payload.get("avatar"), str(normalized.get("name", "新")))

    if not partial or "capacityHours" in payload:
        normalized["capacityHours"] = parse_int_value(
            payload.get("capacityHours", 40),
            "capacityHours",
            1,
        )

    if "sortOrder" in payload:
        normalized["sortOrder"] = parse_int_value(payload.get("sortOrder"), "sortOrder", 0)

    return normalized


def _paginate(query, serializer, total: int, page: int, size: int) -> dict[str, object]:
    """Paginate a prepared query while keeping the expensive count path lean.

    Record tables do not apply additional filters today, so callers pass a
    precomputed `total` from `COUNT(*)` instead of asking SQLAlchemy to wrap the
    full ordered query in another subquery.
    """
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


@api_blueprint.post("/auth/login")
def login() -> Response:
    """Authenticate a username/password pair and return the current account."""

    seed_database()
    payload = _read_json_body()
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))

    if not username or not password:
        return _json_error("请输入账号和密码。", 400)

    account = Account.query.filter(func.lower(Account.username) == username.lower()).first()
    if account is None or not account.is_active or not check_password_hash(account.password_hash, password):
        return _json_error("账号或密码不正确。", 401)

    token = _issue_auth_token(account)
    actor = _actor_label(account)
    append_operation_record("查看", "登录", f"{actor} 登录了项目排期工作台。", actor=actor)
    db.session.commit()
    return jsonify({"token": token, "account": _serialize_current_account(account)})


@api_blueprint.get("/auth/me")
@_require_account
def current_account() -> Response:
    account = _load_current_account()
    return jsonify({"account": _serialize_current_account(account)})


@api_blueprint.post("/auth/logout")
@_require_account
def logout() -> Response:
    actor = _actor_label()
    append_operation_record("查看", "退出登录", f"{actor} 退出了当前登录会话。", actor=actor)
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.patch("/auth/profile")
@_require_account
def update_profile() -> Response:
    """Let the current user edit their visible profile and password."""

    account = _load_current_account()
    payload = _read_json_body()
    display_name = str(payload.get("displayName", "")).strip()
    avatar = _normalize_avatar(payload.get("avatar"), display_name or account.username)
    new_password = str(payload.get("newPassword", ""))
    avatar_image_update = "avatarImage" in payload
    previous_name = account.member.name if account.member else account.display_name or account.username

    if not display_name:
        return _json_error("姓名不能为空。", 400)

    try:
        avatar_image = _normalize_avatar_image(payload.get("avatarImage")) if avatar_image_update else None
    except ValueError as exc:
        return _json_error(str(exc), 400)

    if new_password:
        if len(new_password) < 6:
            return _json_error("新密码至少需要 6 位。", 400)
        account.password_hash = generate_password_hash(new_password, method="pbkdf2:sha256")

    if account.member is not None:
        account.member.name = display_name
        account.member.avatar = avatar
        if avatar_image_update:
            account.member.avatar_image_mime = avatar_image[0] if avatar_image else None
            account.member.avatar_image_data = avatar_image[1] if avatar_image else None
        account.member.updated_at = now_local()
        if previous_name != display_name:
            Team.query.filter(Team.lead == previous_name).update({"lead": display_name})
    else:
        account.display_name = display_name
        account.avatar = avatar
        if avatar_image_update:
            account.avatar_image_mime = avatar_image[0] if avatar_image else None
            account.avatar_image_data = avatar_image[1] if avatar_image else None

    account.updated_at = now_local()
    append_operation_record("修改", "个人资料", "已更新当前账号的姓名、头像或密码。", actor=display_name)
    db.session.commit()
    return jsonify({"account": _serialize_current_account(account)})


@api_blueprint.get("/bootstrap")
@_require_account
def bootstrap() -> Response:
    """Return the initial workspace payload for the SPA.

    This endpoint is intentionally read-heavy, so we keep the row ordering
    consistent and avoid extra count subqueries. The frontend can then hydrate
    its derived caches in one pass.
    """

    seed_database()
    teams = _ordered_teams_query().all()
    members = _ordered_members_query().all()
    tasks = _ordered_tasks_query().all()
    return jsonify(
        {
            "teams": [serialize_team(team) for team in teams],
            "members": [serialize_member(member) for member in members],
            "tasks": [serialize_task(task) for task in tasks],
            "summary": {
                "teamCount": len(teams),
                "memberCount": len(members),
                "taskCount": len(tasks),
                "releaseRecordCount": count_rows(ReleaseRecord),
                "operationRecordCount": count_rows(OperationRecord),
                "generatedAt": now_local().strftime("%Y-%m-%dT%H:%M:%S"),
            },
        }
    )


@api_blueprint.get("/members/<member_id>/avatar")
def member_avatar(member_id: str) -> Response | tuple[Response, int]:
    """Return a member avatar image without inflating normal JSON payloads."""

    member = db.session.get(Member, member_id)
    if member is None:
        return _json_error("成员不存在。", 404)
    return _build_avatar_response(member.avatar_image_mime, member.avatar_image_data, member.updated_at)


@api_blueprint.get("/accounts/<account_id>/avatar")
def account_avatar(account_id: str) -> Response | tuple[Response, int]:
    """Return an admin or unbound account avatar image."""

    account = db.session.get(Account, account_id)
    if account is None:
        return _json_error("账号不存在。", 404)
    return _build_avatar_response(account.avatar_image_mime, account.avatar_image_data, account.updated_at)


@api_blueprint.get("/teams")
@_require_account
def list_teams() -> Response:
    teams = _ordered_teams_query().all()
    return jsonify({"items": [serialize_team(team) for team in teams]})


@api_blueprint.post("/teams")
@_require_org_manager
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
    sort_order = next_sort_order(Team)
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
    append_operation_record("新增", f"团队 / {team.name}", f"已创建团队，负责人为 {team.lead}。", actor=_actor_label())
    db.session.commit()
    return jsonify({"item": serialize_team(team)}), 201


@api_blueprint.patch("/teams/<team_id>")
@_require_org_manager
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
    append_operation_record("修改", f"团队 / {team.name}", "已更新团队基础信息。", actor=_actor_label())
    db.session.commit()
    return jsonify({"item": serialize_team(team)})


@api_blueprint.delete("/teams/<team_id>")
@_require_org_manager
def delete_team(team_id: str) -> Response:
    team = db.session.get(Team, team_id)
    if team is None:
        return _json_error("团队不存在。", 404)

    member_count = _count_by_column(Member, Member.team_id, team_id)
    task_count = _count_by_column(Task, Task.team_id, team_id)
    if member_count > 0 or task_count > 0:
        return _json_error(
            f"团队“{team.name}”仍关联 {member_count} 名成员和 {task_count} 个项目，请先迁移或清理后再删除。",
            409,
        )

    append_operation_record("删除", f"团队 / {team.name}", "已从当前工作区移除团队。", actor=_actor_label())
    db.session.delete(team)
    remaining_teams = _ordered_teams_query().all()
    for index, item in enumerate(remaining_teams):
        item.sort_order = index
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.get("/members")
@_require_account
def list_members() -> Response:
    members = _ordered_members_query().all()
    return jsonify({"items": [serialize_member(member) for member in members]})


@api_blueprint.post("/members")
@_require_org_manager
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
        sort_order=next_sort_order(Member),
        created_at=current_time,
        updated_at=current_time,
    )
    db.session.add(member)
    account = _create_member_account(member)
    append_operation_record(
        "新增",
        f"成员 / {member.name}",
        f"已加入 {normalized['team'].name}，登录账号为 {account.username}，初始密码为 123456。",
        actor=_actor_label(),
    )
    db.session.commit()
    return jsonify({"item": serialize_member(member), "accountUsername": account.username, "defaultPassword": "123456"}), 201


@api_blueprint.patch("/members/<member_id>")
@_require_org_manager
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
        members = _ordered_members_query().all()
        rebalance_sort_orders(members, member, int(normalized["sortOrder"]))

    if previous_name != member.name:
        Team.query.filter(Team.lead == previous_name).update({"lead": member.name})

    member.updated_at = now_local()
    append_operation_record("修改", f"成员 / {member.name}", "已更新成员档案与团队归属。", actor=_actor_label())
    db.session.commit()
    return jsonify({"item": serialize_member(member)})


@api_blueprint.delete("/members/<member_id>")
@_require_org_manager
def delete_member(member_id: str) -> Response:
    member = db.session.get(Member, member_id)
    if member is None:
        return _json_error("成员不存在。", 404)

    owned_task_count = _count_by_column(Task, Task.owner_id, member_id)
    if owned_task_count > 0:
        return _json_error(
            f"成员“{member.name}”仍负责 {owned_task_count} 个项目，请先转交或删除这些项目后再删除成员。",
            409,
        )

    current_time = now_local()
    Team.query.filter(Team.lead == member.name).update({"lead": "待设置"})
    Account.query.filter(Account.member_id == member.id).update(
        {"is_active": False, "member_id": None, "updated_at": current_time}
    )
    append_operation_record("删除", f"成员 / {member.name}", "已从当前工作区移除成员。", actor=_actor_label())
    db.session.delete(member)
    remaining_members = _ordered_members_query().all()
    rebalance_sort_orders(remaining_members)
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.get("/tasks")
@_require_account
def list_tasks() -> Response:
    tasks = _ordered_tasks_query().all()
    return jsonify({"items": [serialize_task(task) for task in tasks]})


@api_blueprint.post("/tasks")
@_require_account
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
        sort_order=next_sort_order(Task),
        summary=str(normalized["summary"]),
        milestone=str(normalized["milestone"]),
        created_at=current_time,
        updated_at=current_time,
    )

    db.session.add(task)
    db.session.flush()

    if "sortOrder" in normalized:
        tasks = _ordered_tasks_query().all()
        rebalance_sort_orders(tasks, task, int(normalized["sortOrder"]))

    append_operation_record("新增", f"项目 / {task.title}", f"已将项目排期分配给 {owner.name}。", actor=_actor_label())
    db.session.commit()
    return jsonify({"item": serialize_task(task)}), 201


@api_blueprint.patch("/tasks/<task_id>")
@_require_account
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
        tasks = _ordered_tasks_query().all()
        rebalance_sort_orders(tasks, task, int(normalized["sortOrder"]))

    task.updated_at = now_local()

    detail = str(payload.get("operationDetail", "")).strip() or "已保存项目排期与详情。"
    append_operation_record("修改", f"项目 / {task.title}", detail, actor=_actor_label())
    db.session.commit()
    return jsonify({"item": serialize_task(task)})


@api_blueprint.delete("/tasks/<task_id>")
@_require_account
def delete_task(task_id: str) -> Response:
    task = db.session.get(Task, task_id)
    if task is None:
        return _json_error("项目不存在。", 404)

    append_operation_record("删除", f"项目 / {task.title}", f"已删除项目“{task.title}”。", actor=_actor_label())
    db.session.delete(task)
    remaining_tasks = _ordered_tasks_query().all()
    rebalance_sort_orders(remaining_tasks)
    db.session.commit()
    return jsonify({"success": True})


@api_blueprint.get("/release-records")
@_require_account
def list_release_records() -> Response:
    page = parse_int_value(request.args.get("page", 1), "page", 1)
    size = parse_int_value(request.args.get("size", 10), "size", 1, 100)
    query = ReleaseRecord.query.order_by(ReleaseRecord.updated_at.desc(), ReleaseRecord.version.desc())
    total = count_rows(ReleaseRecord)
    return jsonify(_paginate(query, serialize_release_record, total, page, size))


@api_blueprint.get("/operation-records")
@_require_account
def list_operation_records() -> Response:
    page = parse_int_value(request.args.get("page", 1), "page", 1)
    size = parse_int_value(request.args.get("size", 10), "size", 1, 100)
    query = OperationRecord.query.order_by(OperationRecord.created_at.desc(), OperationRecord.id.desc())
    total = count_rows(OperationRecord)
    return jsonify(_paginate(query, serialize_operation_record, total, page, size))


@api_blueprint.post("/operation-records/view")
@_require_account
def create_view_operation_record() -> Response:
    payload = _read_json_body()
    target = str(payload.get("target", "")).strip()
    detail = str(payload.get("detail", "")).strip()
    actor = _actor_label()

    if not target or not detail:
        return _json_error("target 和 detail 不能为空。", 400)

    record = append_operation_record("查看", target, detail, actor)
    db.session.commit()
    return jsonify({"item": serialize_operation_record(record)}), 201


@api_blueprint.get("/export/workspace")
@_require_account
def export_workspace() -> Response:
    """Export the current database snapshot as JSON.

    Export can involve a lot of rows, so the endpoint writes the audit record
    once, flushes it, then reuses the same deterministic ordering helpers that
    power the main workspace and record center.
    """

    append_operation_record("导出", "工作区 JSON", "已导出当前数据库中的工作区数据。", actor=_actor_label())
    db.session.flush()
    teams = _ordered_teams_query().all()
    members = _ordered_members_query().all()
    tasks = _ordered_tasks_query().all()
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
