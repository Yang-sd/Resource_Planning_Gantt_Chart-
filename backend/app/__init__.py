from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, abort, request, send_from_directory

from backend.config import Config

from .api import api_blueprint
from .extensions import db


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)
    db.init_app(app)
    app.register_blueprint(api_blueprint, url_prefix="/api")
    _register_security_headers(app)
    _register_frontend_routes(app)
    return app


def _register_security_headers(app: Flask) -> None:
    """Attach browser hardening headers to every response.

    Cloudflare Tunnel already hides the NAS origin from the public Internet, but
    these headers reduce damage from common browser-side attacks such as click
    jacking, MIME sniffing and accidental data leakage through referrers.
    """

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault(
            "Content-Security-Policy",
            "; ".join(
                [
                    "default-src 'self'",
                    "script-src 'self'",
                    "style-src 'self' 'unsafe-inline'",
                    "img-src 'self' data: blob:",
                    "font-src 'self'",
                    "connect-src 'self'",
                    "base-uri 'self'",
                    "form-action 'self'",
                    "frame-ancestors 'none'",
                ]
            ),
        )

        if request.path.startswith("/api/") and response.mimetype == "application/json":
            response.cache_control.no_store = True
            response.headers.setdefault("Pragma", "no-cache")

        if request.headers.get("X-Forwarded-Proto", request.scheme) == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

        return response


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
