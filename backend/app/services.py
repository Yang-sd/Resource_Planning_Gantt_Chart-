from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional, Type, Union
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import func, select

from .extensions import db
from .models import Member, OperationRecord, Task


VALID_STATUSES = {"计划中", "进行中", "风险", "已完成"}
VALID_PRIORITIES = {"P0", "P1", "P2", "P3", "P4", "P5"}


def now_local() -> datetime:
    """Return a naive datetime in the application timezone.

    The project stores local business time instead of UTC because both the
    frontend and the operation audit view are oriented around China local time.
    Keeping the formatting strategy centralized avoids subtle timezone drift in
    API responses and tests.
    """

    timezone_name = current_app.config.get("APP_TIMEZONE", "Asia/Shanghai")
    return datetime.now(ZoneInfo(timezone_name)).replace(tzinfo=None, microsecond=0)


def parse_date_value(value: object, field_name: str) -> date:
    """Parse and validate a strict ISO date string from request payloads."""

    if not isinstance(value, str):
        raise ValueError(f"{field_name} 必须是 YYYY-MM-DD 字符串。")

    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"{field_name} 必须是有效日期。") from exc


def parse_int_value(
    value: object,
    field_name: str,
    minimum: Optional[int] = None,
    maximum: Optional[int] = None,
) -> int:
    """Parse integer input and enforce optional business bounds."""

    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} 必须是整数。") from exc

    if minimum is not None and parsed < minimum:
        raise ValueError(f"{field_name} 不能小于 {minimum}。")

    if maximum is not None and parsed > maximum:
        raise ValueError(f"{field_name} 不能大于 {maximum}。")

    return parsed


def generate_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}"


def count_rows(model: Type[db.Model]) -> int:
    """Count model rows with a direct aggregate query.

    SQLAlchemy's legacy `Query.count()` may generate a heavier subquery,
    especially when a caller already added `ORDER BY`. Using a dedicated
    aggregate statement keeps pagination and summary counts cheaper when the
    table becomes large.
    """

    value = db.session.scalar(select(func.count()).select_from(model))
    return int(value or 0)


def next_sort_order(model: Type[db.Model]) -> int:
    """Return the next append-at-end sort order for sortable tables.

    We intentionally use `MAX(sort_order)` instead of `COUNT(*)` so new writes
    stay cheap even when the table holds many historical rows.
    """

    value = db.session.scalar(select(func.max(model.sort_order)))
    return int(value) + 1 if value is not None else 0


def rebalance_sort_orders(
    items: List[Union[Task, Member]],
    moved_item: Optional[Union[Task, Member]] = None,
    desired_index: Optional[int] = None,
) -> None:
    """Normalize sort_order values after drag-reorder style operations.

    The frontend treats sort order as a dense sequence starting from zero.
    Rebalancing in one place keeps drag/drop logic simple and prevents gaps
    from accumulating after repeated inserts, deletes and cross-owner moves.
    """

    ordered_items = list(items)
    if moved_item is not None and desired_index is not None:
        ordered_items = [item for item in ordered_items if item.id != moved_item.id]
        desired_index = max(0, min(desired_index, len(ordered_items)))
        ordered_items.insert(desired_index, moved_item)

    for index, item in enumerate(ordered_items):
        item.sort_order = index


def append_operation_record(action: str, target: str, detail: str, actor: str = "当前用户") -> OperationRecord:
    """Append an audit record without committing the current transaction.

    Callers can batch the audit insert with their own write operation so the
    business change and the operation trail succeed or fail together.
    """

    record = OperationRecord(
        id=generate_id("operation"),
        actor=actor,
        action=action,
        target=target,
        detail=detail,
        created_at=now_local(),
    )
    db.session.add(record)
    return record
