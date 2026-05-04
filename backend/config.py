from __future__ import annotations

import os


class Config:
    APP_NAME = "Resource Planning API"
    SECRET_KEY = os.environ.get("SECRET_KEY", "resource-planning-local-dev-secret")
    JSON_AS_ASCII = False
    # Keep deploy-time credentials out of Git. Fresh databases read the initial
    # admin password from the environment, while existing databases should be
    # rotated with `backend.manage set-password`.
    ADMIN_INITIAL_PASSWORD = os.environ.get("ADMIN_INITIAL_PASSWORD", "admin")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "mysql+pymysql://resource_planning:resource_planning@127.0.0.1:3306/resource_planning?charset=utf8mb4",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 3600,
    }
    SEED_ON_START = os.environ.get("SEED_ON_START", "true").lower() == "true"
    APP_TIMEZONE = os.environ.get("APP_TIMEZONE", "Asia/Shanghai")
    AUTH_TOKEN_MAX_AGE_SECONDS = int(os.environ.get("AUTH_TOKEN_MAX_AGE_SECONDS", str(7 * 24 * 60 * 60)))
    AUTH_COOKIE_NAME = os.environ.get("AUTH_COOKIE_NAME", "resource_planning_auth")
    AVATAR_UPLOAD_MAX_BYTES = int(os.environ.get("AVATAR_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", str(16 * 1024 * 1024)))
    LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCK_SECONDS = int(os.environ.get("LOGIN_LOCK_SECONDS", str(10 * 60)))
