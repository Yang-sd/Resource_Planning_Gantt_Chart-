from __future__ import annotations

import argparse
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig

from backend.app import create_app
from backend.app.seed import seed_database


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Resource planning backend management")
    parser.add_argument("command", choices=["migrate", "seed", "init-db"])
    args = parser.parse_args()

    if args.command == "migrate":
        upgrade_database()
        return

    if args.command == "seed":
        seed_only()
        return

    initialize_database()


if __name__ == "__main__":
    main()

