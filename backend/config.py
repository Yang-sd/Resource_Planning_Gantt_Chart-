from __future__ import annotations

import os


class Config:
    APP_NAME = "Resource Planning API"
    SECRET_KEY = os.environ.get("SECRET_KEY", "resource-planning-local-dev-secret")
    JSON_AS_ASCII = False
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
    AVATAR_UPLOAD_MAX_BYTES = int(os.environ.get("AVATAR_UPLOAD_MAX_BYTES", str(10 * 1024 * 1024)))
