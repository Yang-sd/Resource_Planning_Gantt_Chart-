from __future__ import annotations

import os


class Config:
    APP_NAME = "Resource Planning API"
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

