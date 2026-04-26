"""Add uploaded avatar image storage."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


revision = "20260426_0005"
down_revision = "20260426_0004"
branch_labels = None
depends_on = None


avatar_data_type = sa.Text().with_variant(mysql.LONGTEXT(), "mysql").with_variant(
    mysql.LONGTEXT(),
    "mariadb",
)


def upgrade() -> None:
    op.add_column("members", sa.Column("avatar_image_mime", sa.String(length=80), nullable=True))
    op.add_column("members", sa.Column("avatar_image_data", avatar_data_type, nullable=True))
    op.add_column("accounts", sa.Column("avatar_image_mime", sa.String(length=80), nullable=True))
    op.add_column("accounts", sa.Column("avatar_image_data", avatar_data_type, nullable=True))


def downgrade() -> None:
    op.drop_column("accounts", "avatar_image_data")
    op.drop_column("accounts", "avatar_image_mime")
    op.drop_column("members", "avatar_image_data")
    op.drop_column("members", "avatar_image_mime")
