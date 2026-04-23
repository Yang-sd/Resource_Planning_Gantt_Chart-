from __future__ import annotations

from datetime import date, datetime, timedelta

from .models import Member, OperationRecord, ReleaseRecord, Task, Team


PRIORITY_COLOR_MAP = {
    "P0": "#ef4444",
    "P1": "#f97316",
    "P2": "#f59e0b",
    "P3": "#0ea5e9",
    "P4": "#6366f1",
    "P5": "#64748b",
}


def _serialize_datetime(value: datetime) -> str:
    return value.strftime("%Y-%m-%dT%H:%M:%S")


def _serialize_date(value: date) -> str:
    return value.isoformat()


def serialize_team(team: Team) -> dict[str, object]:
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
    return {
        "id": member.id,
        "name": member.name,
        "role": member.role,
        "teamId": member.team_id,
        "avatar": member.avatar,
        "capacityHours": member.capacity_hours,
        "sortOrder": member.sort_order,
        "createdAt": _serialize_datetime(member.created_at),
        "updatedAt": _serialize_datetime(member.updated_at),
    }


def serialize_task(task: Task) -> dict[str, object]:
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
    return {
        "id": record.id,
        "version": record.version,
        "updatedAt": _serialize_datetime(record.updated_at),
        "features": record.features,
    }


def serialize_operation_record(record: OperationRecord) -> dict[str, object]:
    return {
        "id": record.id,
        "actor": record.actor,
        "action": record.action,
        "target": record.target,
        "detail": record.detail,
        "time": _serialize_datetime(record.created_at),
    }

