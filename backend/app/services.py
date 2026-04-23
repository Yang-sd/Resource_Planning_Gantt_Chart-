from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Optional, Union
from zoneinfo import ZoneInfo

from flask import current_app

from .extensions import db
from .models import Member, OperationRecord, Task


VALID_STATUSES = {"计划中", "进行中", "风险", "已完成"}
VALID_PRIORITIES = {"P0", "P1", "P2", "P3", "P4", "P5"}


def now_local() -> datetime:
    timezone_name = current_app.config.get("APP_TIMEZONE", "Asia/Shanghai")
    return datetime.now(ZoneInfo(timezone_name)).replace(tzinfo=None, microsecond=0)


def parse_date_value(value: object, field_name: str) -> date:
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


def rebalance_sort_orders(
    items: List[Union[Task, Member]],
    moved_item: Optional[Union[Task, Member]] = None,
    desired_index: Optional[int] = None,
) -> None:
    ordered_items = list(items)
    if moved_item is not None and desired_index is not None:
        ordered_items = [item for item in ordered_items if item.id != moved_item.id]
        desired_index = max(0, min(desired_index, len(ordered_items)))
        ordered_items.insert(desired_index, moved_item)

    for index, item in enumerate(ordered_items):
        item.sort_order = index


def append_operation_record(action: str, target: str, detail: str, actor: str = "当前用户") -> OperationRecord:
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
