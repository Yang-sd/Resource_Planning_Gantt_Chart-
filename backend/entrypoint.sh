#!/bin/sh
set -eu

python -m backend.manage init-db
exec gunicorn --bind 0.0.0.0:8000 --workers 3 backend.wsgi:app

