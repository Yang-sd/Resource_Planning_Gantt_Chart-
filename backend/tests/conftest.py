from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import text

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app import create_app
from backend.app.extensions import db
from backend.app.seed import seed_database
from backend.config import Config


def _find_free_port() -> int:
    """Reserve a free local port for the temporary MySQL container."""

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _run_command(command_args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    """Run a subprocess and capture output for easier test failure diagnostics."""

    return subprocess.run(command_args, check=check, text=True, capture_output=True)


def _wait_for_mysql(container_name: str, timeout_seconds: int = 90) -> None:
    """Poll the MySQL container health check until the database is ready."""

    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        status = _run_command(
            ["docker", "inspect", "-f", "{{.State.Health.Status}}", container_name],
            check=False,
        )
        if status.returncode == 0 and status.stdout.strip() == "healthy":
            return
        time.sleep(2)
    logs = _run_command(["docker", "logs", container_name], check=False)
    raise RuntimeError(f"MySQL 容器未在规定时间内就绪。\n{logs.stdout}\n{logs.stderr}")


def _build_alembic_config(database_url: str) -> AlembicConfig:
    """Create an Alembic config pointing at the disposable test database."""

    backend_dir = Path(__file__).resolve().parents[1]
    config = AlembicConfig(str(backend_dir / "alembic.ini"))
    config.set_main_option("script_location", str(backend_dir / "migrations"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _truncate_all_tables() -> None:
    """Reset tables between tests without recreating the schema each time."""

    statements = [
        "SET FOREIGN_KEY_CHECKS = 0",
        "TRUNCATE TABLE accounts",
        "TRUNCATE TABLE tasks",
        "TRUNCATE TABLE members",
        "TRUNCATE TABLE teams",
        "TRUNCATE TABLE release_records",
        "TRUNCATE TABLE operation_records",
        "SET FOREIGN_KEY_CHECKS = 1",
    ]
    with db.engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


@pytest.fixture(scope="session")
def mysql_database_url() -> str:
    """Provide a real MySQL database URL backed by a short-lived Docker container."""

    port = _find_free_port()
    container_name = f"resource-planning-test-mysql-{uuid.uuid4().hex[:8]}"
    image = os.environ.get("TEST_MYSQL_IMAGE", "mysql:8.0")

    _run_command(
        [
            "docker",
            "run",
            "--rm",
            "-d",
            "--name",
            container_name,
            "-e",
            "MYSQL_ROOT_PASSWORD=root",
            "-e",
            "MYSQL_DATABASE=resource_planning_test",
            "-e",
            "MYSQL_USER=resource_planning",
            "-e",
            "MYSQL_PASSWORD=resource_planning",
            "--health-cmd=mysqladmin ping -h 127.0.0.1 -uroot -proot",
            "--health-interval=5s",
            "--health-timeout=5s",
            "--health-retries=20",
            "-p",
            f"{port}:3306",
            image,
            "--default-authentication-plugin=mysql_native_password",
        ]
    )

    try:
        _wait_for_mysql(container_name)
        yield (
            "mysql+pymysql://resource_planning:resource_planning"
            f"@127.0.0.1:{port}/resource_planning_test?charset=utf8mb4"
        )
    finally:
        _run_command(["docker", "rm", "-f", container_name], check=False)


@pytest.fixture(scope="session")
def app(mysql_database_url: str):
    """Create the Flask app once per test session and migrate the schema to head."""

    class TestConfig(Config):
        TESTING = True
        SQLALCHEMY_DATABASE_URI = mysql_database_url
        SEED_ON_START = False

    app = create_app(TestConfig)

    with app.app_context():
        command.upgrade(_build_alembic_config(mysql_database_url), "head")
        _truncate_all_tables()
        seed_database()

    yield app


@pytest.fixture()
def client(app):
    """Return a clean HTTP client with freshly seeded business data per test."""

    with app.app_context():
        _truncate_all_tables()
        seed_database()
    return app.test_client()
