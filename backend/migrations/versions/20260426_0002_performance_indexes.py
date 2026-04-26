"""Add composite indexes for high-frequency list and audit queries."""

from alembic import op


revision = "20260426_0002"
down_revision = "20260422_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # These composite indexes match the API's hottest read paths:
    # - bootstrap/list pages sort by `sort_order`
    # - records center sorts by timestamp
    # - org and scheduling flows frequently scope by owner/team + sort order
    op.create_index("ix_teams_sort_order_created_at", "teams", ["sort_order", "created_at"], unique=False)
    op.create_index("ix_members_sort_order_created_at", "members", ["sort_order", "created_at"], unique=False)
    op.create_index("ix_members_team_id_sort_order", "members", ["team_id", "sort_order"], unique=False)
    op.create_index("ix_tasks_sort_order_updated_at", "tasks", ["sort_order", "updated_at"], unique=False)
    op.create_index("ix_tasks_owner_id_sort_order", "tasks", ["owner_id", "sort_order"], unique=False)
    op.create_index("ix_tasks_team_id_sort_order", "tasks", ["team_id", "sort_order"], unique=False)
    op.create_index("ix_tasks_start_date", "tasks", ["start_date"], unique=False)
    op.create_index("ix_release_records_updated_at", "release_records", ["updated_at"], unique=False)
    op.create_index("ix_operation_records_created_at", "operation_records", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_operation_records_created_at", table_name="operation_records")
    op.drop_index("ix_release_records_updated_at", table_name="release_records")
    op.drop_index("ix_tasks_start_date", table_name="tasks")
    op.drop_index("ix_tasks_team_id_sort_order", table_name="tasks")
    op.drop_index("ix_tasks_owner_id_sort_order", table_name="tasks")
    op.drop_index("ix_tasks_sort_order_updated_at", table_name="tasks")
    op.drop_index("ix_members_team_id_sort_order", table_name="members")
    op.drop_index("ix_members_sort_order_created_at", table_name="members")
    op.drop_index("ix_teams_sort_order_created_at", table_name="teams")
