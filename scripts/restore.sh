#!/bin/sh
# Restores a backup made by backup.sh into the named volumes. Stop the app
# first (`docker compose down`) so nothing is writing to the DB mid-restore.
#
# Usage: ./scripts/restore.sh path/to/rentledger-backup-YYYY-MM-DD-HHMM.tar.gz
set -e

ARCHIVE="$1"
if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: $0 path/to/backup.tar.gz" >&2
  exit 1
fi

PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$(pwd)")}"
DB_VOLUME="${PROJECT}_app_data"
UPLOADS_VOLUME="${PROJECT}_uploads_data"
ARCHIVE_ABS=$(cd "$(dirname "$ARCHIVE")" && pwd)/$(basename "$ARCHIVE")

echo "This will OVERWRITE the contents of volumes: $DB_VOLUME, $UPLOADS_VOLUME"
printf "Continue? [y/N] "
read -r confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Aborted."
  exit 1
fi

docker run --rm \
  -v "${DB_VOLUME}:/data/app_data" \
  -v "${UPLOADS_VOLUME}:/data/uploads_data" \
  -v "${ARCHIVE_ABS}:/backup.tar.gz:ro" \
  alpine sh -c "rm -rf /data/app_data/* /data/uploads_data/* && tar xzf /backup.tar.gz -C /data"

echo "Restore complete. Start the app with: docker compose up -d"
