from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


class TimestampMixin:
    """Shared timestamps for business tables.

    The frontend surfaces both create/update times in management panels and in
    the audit center, so keeping the fields consistent across models helps both
    serialization and future index planning.
    """

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Team(db.Model, TimestampMixin):
    """Team entity used by overview filters, timeline grouping and org management."""

    __tablename__ = "teams"
    __table_args__ = (Index("ix_teams_sort_order_created_at", "sort_order", "created_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    lead: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    members: Mapped[list["Member"]] = relationship("Member", back_populates="team")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="team")


class Member(db.Model, TimestampMixin):
    """Human resource entry bound to one team and many tasks."""

    __tablename__ = "members"
    __table_args__ = (
        Index("ix_members_sort_order_created_at", "sort_order", "created_at"),
        Index("ix_members_team_id_sort_order", "team_id", "sort_order"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(120), nullable=False)
    team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    avatar: Mapped[str] = mapped_column(String(16), nullable=False)
    avatar_image_mime: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    avatar_image_data: Mapped[Optional[str]] = mapped_column(
        Text().with_variant(LONGTEXT(), "mysql").with_variant(LONGTEXT(), "mariadb"),
        nullable=True,
    )
    capacity_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    team: Mapped[Team] = relationship("Team", back_populates="members")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="owner")
    accounts: Mapped[list["Account"]] = relationship("Account", back_populates="member")


class Account(db.Model, TimestampMixin):
    """Login account bound to an optional member profile.

    Accounts keep authentication separate from member records so an admin user
    can exist without occupying a delivery resource row, while regular users
    still resolve back to the member they represent in the scheduling product.
    """

    __tablename__ = "accounts"
    __table_args__ = (Index("ix_accounts_member_id", "member_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="member")
    display_name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    avatar_image_mime: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    avatar_image_data: Mapped[Optional[str]] = mapped_column(
        Text().with_variant(LONGTEXT(), "mysql").with_variant(LONGTEXT(), "mariadb"),
        nullable=True,
    )
    member_id: Mapped[Optional[str]] = mapped_column(
        String(64),
        ForeignKey("members.id", ondelete="SET NULL", onupdate="CASCADE"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    member: Mapped[Optional[Member]] = relationship("Member", back_populates="accounts")


class Task(db.Model, TimestampMixin):
    """Project scheduling item rendered in both overview and timeline views.

    We keep the owner/team foreign keys denormalized on the task row so common
    read paths do not need joins just to render the main workspace.
    """

    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_sort_order_updated_at", "sort_order", "updated_at"),
        Index("ix_tasks_owner_id_sort_order", "owner_id", "sort_order"),
        Index("ix_tasks_team_id_sort_order", "team_id", "sort_order"),
        Index("ix_tasks_start_date", "start_date"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("members.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    priority: Mapped[str] = mapped_column(String(8), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    milestone: Mapped[str] = mapped_column(String(200), nullable=False)

    owner: Mapped[Member] = relationship("Member", back_populates="tasks")
    team: Mapped[Team] = relationship("Team", back_populates="tasks")


class ReleaseRecord(db.Model):
    """Version history records shown in the read-only release center."""

    __tablename__ = "release_records"
    __table_args__ = (Index("ix_release_records_updated_at", "updated_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    features: Mapped[list[str]] = mapped_column(JSON, nullable=False)


class OperationRecord(db.Model):
    """Audit trail for CRUD, export and explicit page-view actions."""

    __tablename__ = "operation_records"
    __table_args__ = (Index("ix_operation_records_created_at", "created_at"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
