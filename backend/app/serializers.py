from __future__ import annotations

from datetime import date, datetime, timedelta

from .models import Account, Member, OperationRecord, ReleaseRecord, Task, Team


PRIORITY_COLOR_MAP = {
    "P0": "#ef4444",
    "P1": "#f97316",
    "P2": "#f59e0b",
    "P3": "#0ea5e9",
    "P4": "#6366f1",
    "P5": "#64748b",
}


def _serialize_datetime(value: datetime) -> str:
    """Serialize datetimes in the API's agreed ISO-like format."""

    return value.strftime("%Y-%m-%dT%H:%M:%S")


def _serialize_date(value: date) -> str:
    """Serialize business dates for the frontend timeline model."""

    return value.isoformat()


def _avatar_image_url(resource: str, item_id: str, updated_at: datetime, has_image: bool) -> str | None:
    """Return a cache-busted avatar URL without embedding large image data in JSON."""

    if not has_image:
        return None
    version = int(updated_at.timestamp())
    return f"/api/{resource}/{item_id}/avatar?v={version}"


def serialize_team(team: Team) -> dict[str, object]:
    """Convert Team ORM rows into camelCase JSON consumed by React."""

    return {
        "id": team.id,
        "name": team.name,
        "lead": team.lead,
        "color": team.color,
        "sortOrder": team.sort_order,
        "createdAt": _serialize_datetime(team.created_at),
        "updatedAt": _serialize_datetime(team.updated_at),
    }


def serialize_member(member: Member) -> dict[str, object]:
    """Serialize a member record without forcing any extra relationship load."""

    return {
        "id": member.id,
        "name": member.name,
        "role": member.role,
        "teamId": member.team_id,
        "avatar": member.avatar,
        "avatarImageUrl": _avatar_image_url(
            "members",
            member.id,
            member.updated_at,
            bool(member.avatar_image_mime and member.avatar_image_data),
        ),
        "capacityHours": member.capacity_hours,
        "sortOrder": member.sort_order,
        "createdAt": _serialize_datetime(member.created_at),
        "updatedAt": _serialize_datetime(member.updated_at),
    }


def serialize_account(account: Account, can_manage_organization: bool) -> dict[str, object]:
    """Serialize the current account and the permissions the UI should honor."""

    is_admin = account.role == "admin"
    member_name = account.member.name if account.member else None
    member_avatar = account.member.avatar if account.member else None
    display_name = member_name or account.display_name or ("管理员" if is_admin else account.username)
    avatar = member_avatar or account.avatar or display_name[:1] or "用"
    member_avatar_image_url = (
        _avatar_image_url(
            "members",
            account.member.id,
            account.member.updated_at,
            bool(account.member.avatar_image_mime and account.member.avatar_image_data),
        )
        if account.member
        else None
    )
    account_avatar_image_url = _avatar_image_url(
        "accounts",
        account.id,
        account.updated_at,
        bool(account.avatar_image_mime and account.avatar_image_data),
    )
    effective_role = "admin" if is_admin else "team_lead" if can_manage_organization else "member"

    return {
        "id": account.id,
        "username": account.username,
        "role": effective_role,
        "memberId": account.member_id,
        "memberName": member_name,
        "displayName": display_name,
        "avatar": avatar,
        "avatarImageUrl": member_avatar_image_url or account_avatar_image_url,
        "permissions": {
            "canManageAll": is_admin,
            "canManageOrganization": can_manage_organization,
        },
    }


def serialize_task(task: Task) -> dict[str, object]:
    """Serialize task rows and derive the inclusive end date on the fly.

    End date is derived instead of stored so drag/resize writes only need to
    persist start date plus duration, which keeps mutation payloads smaller and
    avoids redundant state that can drift out of sync.
    """

    end_date = task.start_date + timedelta(days=max(task.duration - 1, 0))
    return {
        "id": task.id,
        "title": task.title,
        "ownerId": task.owner_id,
        "teamId": task.team_id,
        "progress": task.progress,
        "status": task.status,
        "priority": task.priority,
        "startDate": _serialize_date(task.start_date),
        "endDate": _serialize_date(end_date),
        "duration": task.duration,
        "sortOrder": task.sort_order,
        "color": PRIORITY_COLOR_MAP.get(task.priority, "#64748b"),
        "summary": task.summary,
        "milestone": task.milestone,
        "createdAt": _serialize_datetime(task.created_at),
        "updatedAt": _serialize_datetime(task.updated_at),
    }


def serialize_release_record(record: ReleaseRecord) -> dict[str, object]:
    """Serialize version history entries for paginated record tables."""

    return {
        "id": record.id,
        "version": record.version,
        "updatedAt": _serialize_datetime(record.updated_at),
        "features": record.features,
    }


def serialize_operation_record(record: OperationRecord) -> dict[str, object]:
    """Serialize audit entries for the operation center and JSON export."""

    return {
        "id": record.id,
        "actor": record.actor,
        "action": record.action,
        "target": record.target,
        "detail": record.detail,
        "time": _serialize_datetime(record.created_at),
    }
