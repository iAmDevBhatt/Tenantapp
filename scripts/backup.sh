#!/bin/sh
# Backs up both named volumes (SQLite DB + all uploaded files) to a single
# tar.gz on the host. Run from the machine hosting the Docker daemon.
#
# Usage: ./scripts/backup.sh [output-dir]   (default: ./backups)
set -e

OUT_DIR="${1:-./backups}"
STAMP=$(date +%F-%H%M)
mkdir -p "$OUT_DIR"

# Volume names are prefixed with the compose project name (the directory
# docker-compose.yml lives in) unless overridden with COMPOSE_PROJECT_NAME.
PROJECT="${COMPOSE_PROJECT_NAME:-$(basename "$(pwd)")}"
DB_VOLUME="${PROJECT}_app_data"
UPLOADS_VOLUME="${PROJECT}_uploads_data"

echo "Backing up volumes: $DB_VOLUME, $UPLOADS_VOLUME"

docker run --rm \
  -v "${DB_VOLUME}:/data/app_data:ro" \
  -v "${UPLOADS_VOLUME}:/data/uploads_data:ro" \
  -v "$(pwd)/${OUT_DIR}:/backup" \
  alpine sh -c "tar czf /backup/rentledger-backup-${STAMP}.tar.gz -C /data app_data uploads_data"

echo "Backup written to ${OUT_DIR}/rentledger-backup-${STAMP}.tar.gz"
echo "Restore with: ./scripts/restore.sh ${OUT_DIR}/rentledger-backup-${STAMP}.tar.gz"
