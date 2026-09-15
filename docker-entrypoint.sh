#!/bin/sh
set -e

# 1. Optional PUID/PGID step-down: create a matching user/group, chown the
#    volume-mounted data dirs, then re-exec the rest of this script via gosu
#    as that user. Solves host/container file-ownership mismatches on
#    bind-mounted volumes without baking a fixed UID into the image.
if [ -n "$PUID" ] && [ -n "$PGID" ] && [ "$(id -u)" = "0" ]; then
  if ! getent group "$PGID" >/dev/null 2>&1; then
    addgroup --gid "$PGID" appgroup
  fi
  APP_GROUP=$(getent group "$PGID" | cut -d: -f1)
  if ! getent passwd "$PUID" >/dev/null 2>&1; then
    adduser --uid "$PUID" --gid "$PGID" --disabled-password --gecos "" appuser
  fi
  APP_USER=$(getent passwd "$PUID" | cut -d: -f1)

  mkdir -p /app/data /app/uploads
  chown -R "$PUID:$PGID" /app/data /app/uploads

  exec gosu "$APP_USER:$APP_GROUP" "$0" "$@"
fi

# 2. Fail fast if the DB's parent directory doesn't exist -- almost always
#    means DATABASE_URL and the volume mount target have drifted apart.
DB_PATH=$(echo "$DATABASE_URL" | sed -E 's#^sqlite:////#/#; s#^sqlite:///#./#')
DB_DIR=$(dirname "$DB_PATH")
if [ ! -d "$DB_DIR" ]; then
  echo "FATAL: database directory '$DB_DIR' does not exist (check DATABASE_URL vs the mounted volume)." >&2
  exit 1
fi

mkdir -p "$UPLOADS_DIR"

# 3. Run schema migrations (idempotent -- safe on every boot).
echo "Running migrations..."
python -m backend.migrate

# 4. Seed default data (admin account, settings row -- also idempotent).
echo "Seeding default data..."
python -m backend.seed

# 5. exec the server last so it becomes PID 1 and receives signals directly.
echo "Starting Rent Ledger on port ${PORT:-8000}..."
exec python -m uvicorn backend.main:app --host 0.0.0.0 --port "${PORT:-8000}"
