"""Add archived snapshots for confirmed team cascade deletes."""

from alembic import op
import sqlalchemy as sa


revision = "20260504_0007"
down_revision = "20260504_0006"
branch_labels = None
depends_on = None


TABLE_COMMENT = "历史删除组人项目归档表：保存确认删除团队时同步移除的团队、成员和项目快照。"

COLUMN_COMMENTS = {
    "id": "归档记录唯一 ID，主键。",
    "actor": "执行删除确认的操作人名称。",
    "team_id": "被删除团队的原始团队 ID。",
    "team_name": "被删除团队的原始团队名称。",
    "member_count": "本次随团队一起删除的成员数量。",
    "task_count": "本次随团队一起删除的项目数量。",
    "snapshot": "删除前的团队、成员和项目核心业务字段快照，JSON 格式。",
    "created_at": "归档创建时间，按系统本地时区保存。",
}


def _quote_identifier(identifier):
    return '"' + identifier.replace('"', '""') + '"'


def _quote_literal(value):
    return "'" + value.replace("'", "''") + "'"


def _comment_on_table(table_name, comment):
    op.execute(
        f"COMMENT ON TABLE {_quote_identifier(table_name)} IS {_quote_literal(comment)}"
    )


def _comment_on_column(table_name, column_name, comment):
    op.execute(
        "COMMENT ON COLUMN "
        f"{_quote_identifier(table_name)}.{_quote_identifier(column_name)} "
        f"IS {_quote_literal(comment)}"
    )


def upgrade() -> None:
    op.create_table(
        "deleted_resource_archives",
        sa.Column("id", sa.String(length=64), nullable=False, comment=COLUMN_COMMENTS["id"]),
        sa.Column("actor", sa.String(length=120), nullable=False, comment=COLUMN_COMMENTS["actor"]),
        sa.Column("team_id", sa.String(length=64), nullable=False, comment=COLUMN_COMMENTS["team_id"]),
        sa.Column("team_name", sa.String(length=120), nullable=False, comment=COLUMN_COMMENTS["team_name"]),
        sa.Column(
            "member_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment=COLUMN_COMMENTS["member_count"],
        ),
        sa.Column(
            "task_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
            comment=COLUMN_COMMENTS["task_count"],
        ),
        sa.Column("snapshot", sa.JSON(), nullable=False, comment=COLUMN_COMMENTS["snapshot"]),
        sa.Column("created_at", sa.DateTime(), nullable=False, comment=COLUMN_COMMENTS["created_at"]),
        sa.PrimaryKeyConstraint("id"),
        comment=TABLE_COMMENT,
    )
    op.create_index(
        "ix_deleted_resource_archives_created_at",
        "deleted_resource_archives",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_deleted_resource_archives_team_name",
        "deleted_resource_archives",
        ["team_name"],
        unique=False,
    )

    if op.get_bind().dialect.name == "postgresql":
        _comment_on_table("deleted_resource_archives", TABLE_COMMENT)
        for column_name, comment in COLUMN_COMMENTS.items():
            _comment_on_column("deleted_resource_archives", column_name, comment)


def downgrade() -> None:
    op.drop_index("ix_deleted_resource_archives_team_name", table_name="deleted_resource_archives")
    op.drop_index("ix_deleted_resource_archives_created_at", table_name="deleted_resource_archives")
    op.drop_table("deleted_resource_archives")
