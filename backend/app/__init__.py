from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, abort, send_from_directory

from backend.config import Config

from .api import api_blueprint
from .extensions import db


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)
    db.init_app(app)
    app.register_blueprint(api_blueprint, url_prefix="/api")
    _register_frontend_routes(app)
    return app


def _register_frontend_routes(app: Flask) -> None:
    frontend_dist_dir = os.environ.get("FRONTEND_DIST_DIR")
    if not frontend_dist_dir:
        return

    frontend_root = Path(frontend_dist_dir).resolve()
    index_file = frontend_root / "index.html"
    if not index_file.exists():
        return

    @app.get("/")
    def serve_frontend_index():
        return send_from_directory(frontend_root, "index.html")

    @app.get("/<path:asset_path>")
    def serve_frontend_asset(asset_path: str):
        if asset_path.startswith("api/"):
            abort(404)

        requested_asset = frontend_root / asset_path
        if requested_asset.is_file():
            return send_from_directory(frontend_root, asset_path)

        return send_from_directory(frontend_root, "index.html")
