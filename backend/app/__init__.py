from __future__ import annotations

from flask import Flask

from backend.config import Config

from .api import api_blueprint
from .extensions import db


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)
    db.init_app(app)
    app.register_blueprint(api_blueprint, url_prefix="/api")
    return app

