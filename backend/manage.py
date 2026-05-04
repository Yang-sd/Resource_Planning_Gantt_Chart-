from __future__ import annotations

import argparse
import os
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import func
from werkzeug.security import generate_password_hash

from backend.app import create_app
from backend.app.extensions import db
from backend.app.models import Account
from backend.app.seed import seed_database
from backend.app.services import now_local


def _get_alembic_config() -> AlembicConfig:
    base_dir = Path(__file__).resolve().parent
    config = AlembicConfig(str(base_dir / "alembic.ini"))
    config.set_main_option("script_location", str(base_dir / "migrations"))
    config.set_main_option("sqlalchemy.url", create_app().config["SQLALCHEMY_DATABASE_URI"])
    return config


def upgrade_database() -> None:
    command.upgrade(_get_alembic_config(), "head")


def initialize_database() -> None:
    app = create_app()
    with app.app_context():
        upgrade_database()
        seed_database()


def seed_only() -> None:
    app = create_app()
    with app.app_context():
        seed_database()


def set_account_password(username: str, password: str) -> None:
    """Rotate a user's password without exposing it in source code.

    The intended production flow is:
    `ACCOUNT_PASSWORD='new-secret' python -m backend.manage set-password --username admin`
    """

    if len(password) < 8:
        raise SystemExit("密码至少需要 8 位。")

    app = create_app()
    with app.app_context():
        account = Account.query.filter(func.lower(Account.username) == username.lower()).first()
        if account is None:
            raise SystemExit(f"账号不存在：{username}")

        account.password_hash = generate_password_hash(password, method="pbkdf2:sha256")
        account.updated_at = now_local()
        db.session.commit()
        print(f"Password updated for account: {account.username}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Resource planning backend management")
    parser.add_argument("command", choices=["migrate", "seed", "init-db", "set-password"])
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password")
    args = parser.parse_args()

    if args.command == "migrate":
        upgrade_database()
        return

    if args.command == "seed":
        seed_only()
        return

    if args.command == "set-password":
        password = args.password or os.environ.get("ACCOUNT_PASSWORD", "")
        if not password:
            raise SystemExit("请通过 --password 或 ACCOUNT_PASSWORD 提供新密码。")
        set_account_password(args.username, password)
        return

    initialize_database()


if __name__ == "__main__":
    main()
