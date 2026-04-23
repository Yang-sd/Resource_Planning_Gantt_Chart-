from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Team(db.Model, TimestampMixin):
    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    lead: Mapped[str] = mapped_column(String(120), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    members: Mapped[list["Member"]] = relationship("Member", back_populates="team")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="team")


class Member(db.Model, TimestampMixin):
    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[str] = mapped_column(String(120), nullable=False)
    team_id: Mapped[str] = mapped_column(
        String(64),
        ForeignKey("teams.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    avatar: Mapped[str] = mapped_column(String(16), nullable=False)
    capacity_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    team: Mapped[Team] = relationship("Team", back_populates="members")
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="owner")


class Task(db.Model, TimestampMixin):
    __tablename__ = "tasks"

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
    __tablename__ = "release_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    version: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    features: Mapped[list[str]] = mapped_column(JSON, nullable=False)


class OperationRecord(db.Model):
    __tablename__ = "operation_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    target: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

