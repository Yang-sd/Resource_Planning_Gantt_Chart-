"""Add login accounts and member-bound roles."""

from alembic import op
import sqlalchemy as sa


revision = "20260426_0003"
down_revision = "20260426_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("username", sa.String(length=80), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False, server_default="member"),
        sa.Column("member_id", sa.String(length=64), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL", onupdate="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_index("ix_accounts_member_id", "accounts", ["member_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_accounts_member_id", table_name="accounts")
    op.drop_table("accounts")
