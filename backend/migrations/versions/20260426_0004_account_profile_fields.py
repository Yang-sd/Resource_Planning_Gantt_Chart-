"""Add editable profile fields to accounts."""

from alembic import op
import sqlalchemy as sa


revision = "20260426_0004"
down_revision = "20260426_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("display_name", sa.String(length=120), nullable=True))
    op.add_column("accounts", sa.Column("avatar", sa.String(length=16), nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "avatar")
    op.drop_column("accounts", "display_name")
