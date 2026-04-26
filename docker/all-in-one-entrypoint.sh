#!/usr/bin/env bash
set -Eeuo pipefail

export PATH="/opt/resource-planning-venv/bin:${PATH}"
export APP_TIMEZONE="${APP_TIMEZONE:-Asia/Shanghai}"
export SECRET_KEY="${SECRET_KEY:-resource-planning-single-container-secret}"
export AUTH_TOKEN_MAX_AGE_SECONDS="${AUTH_TOKEN_MAX_AGE_SECONDS:-604800}"
export AVATAR_UPLOAD_MAX_BYTES="${AVATAR_UPLOAD_MAX_BYTES:-10485760}"

MYSQL_DATABASE="${MYSQL_DATABASE:-resource_planning}"
MYSQL_USER="${MYSQL_USER:-resource_planning}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-resource_planning}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-root}"
API_WORKERS="${API_WORKERS:-2}"

export DATABASE_URL="${DATABASE_URL:-mysql+pymysql://${MYSQL_USER}:${MYSQL_PASSWORD}@127.0.0.1:3306/${MYSQL_DATABASE}?charset=utf8mb4}"

MYSQL_PID=""
API_PID=""
NGINX_PID=""

sql_literal_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

sql_identifier_escape() {
  printf "%s" "$1" | sed 's/`/``/g'
}

cleanup() {
  set +e
  if [ -n "${NGINX_PID}" ]; then
    kill "${NGINX_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${API_PID}" ]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [ -n "${MYSQL_PID}" ]; then
    mysqladmin --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" shutdown >/dev/null 2>&1 \
      || kill "${MYSQL_PID}" >/dev/null 2>&1 \
      || true
  fi
}

trap cleanup INT TERM EXIT

wait_for_mysql() {
  for _ in $(seq 1 90); do
    if mysqladmin --protocol=socket -uroot ping >/dev/null 2>&1; then
      return 0
    fi
    if mysqladmin --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" ping >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "MySQL did not become ready in time." >&2
  exit 1
}

run_mysql_root_sql() {
  if mysql --protocol=socket -uroot -e "SELECT 1" >/dev/null 2>&1; then
    mysql --protocol=socket -uroot "$@"
    return
  fi

  mysql --protocol=socket -uroot -p"${MYSQL_ROOT_PASSWORD}" "$@"
}

initialize_mysql_if_needed() {
  mkdir -p /run/mysqld /var/lib/mysql
  chown -R mysql:mysql /run/mysqld /var/lib/mysql

  if [ ! -d /var/lib/mysql/mysql ]; then
    rm -rf /var/lib/mysql/*
    mysqld --initialize-insecure --user=mysql --datadir=/var/lib/mysql
  fi
}

ensure_mysql_database() {
  local db_name user_name user_password root_password
  db_name="$(sql_identifier_escape "${MYSQL_DATABASE}")"
  user_name="$(sql_literal_escape "${MYSQL_USER}")"
  user_password="$(sql_literal_escape "${MYSQL_PASSWORD}")"
  root_password="$(sql_literal_escape "${MYSQL_ROOT_PASSWORD}")"

  run_mysql_root_sql <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '${root_password}';
CREATE DATABASE IF NOT EXISTS \`${db_name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${user_name}'@'%' IDENTIFIED WITH mysql_native_password BY '${user_password}';
CREATE USER IF NOT EXISTS '${user_name}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${user_password}';
CREATE USER IF NOT EXISTS '${user_name}'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '${user_password}';
ALTER USER '${user_name}'@'%' IDENTIFIED WITH mysql_native_password BY '${user_password}';
ALTER USER '${user_name}'@'localhost' IDENTIFIED WITH mysql_native_password BY '${user_password}';
ALTER USER '${user_name}'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY '${user_password}';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${user_name}'@'%';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${user_name}'@'localhost';
GRANT ALL PRIVILEGES ON \`${db_name}\`.* TO '${user_name}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
}

initialize_mysql_if_needed

mysqld \
  --user=mysql \
  --datadir=/var/lib/mysql \
  --socket=/run/mysqld/mysqld.sock \
  --bind-address=127.0.0.1 \
  --port=3306 &
MYSQL_PID="$!"

wait_for_mysql
ensure_mysql_database

python -m backend.manage init-db

gunicorn --bind 127.0.0.1:8000 --workers "${API_WORKERS}" backend.wsgi:app &
API_PID="$!"

nginx -g "daemon off;" &
NGINX_PID="$!"

wait -n "${MYSQL_PID}" "${API_PID}" "${NGINX_PID}"
