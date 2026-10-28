#!/bin/bash
# سكوول (schoole) — daily backup: MySQL dump + uploaded files (storage volume).
# Cron 03:17 daily. Keeps 14 daily + 8 weekly (Sunday) copies. Logs to backup.log.
# Restore DB:   gunzip -c /opt/backups/schoole/db/schoole-YYYY-MM-DD.sql.gz | docker exec -i schoole-db mysql -uroot -p"$ROOT_PW" schoole
# Restore files: docker run --rm -v schoole_schoole-api-storage:/data -v /opt/backups/schoole/files:/b alpine tar xzf /b/storage-YYYY-MM-DD.tgz -C /data
set -euo pipefail
cd /opt/schoole
exec 9>/tmp/schoole-backup.lock
flock -n 9 || exit 0

DEST=/opt/backups/schoole
LOG=/opt/schoole/backup.log
TODAY=$(date +%F)
ROOT_PW=$(grep -m1 'MYSQL_ROOT_PASSWORD:' docker-compose.yml | awk '{print $2}')
mkdir -p "$DEST/db" "$DEST/files" "$DEST/weekly"

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# 1) database — single-transaction = consistent snapshot without locking the live app
TMP="$DEST/db/.schoole-$TODAY.sql.gz.part"
docker exec schoole-db sh -c "mysqldump -uroot -p'$ROOT_PW' --single-transaction --quick --routines --triggers --default-character-set=utf8mb4 schoole" 2>/dev/null \
  | gzip -6 > "$TMP"
# sanity: a real dump ends with the completion marker
if ! gunzip -c "$TMP" | tail -n 3 | grep -q 'Dump completed'; then
  log "ERROR db dump incomplete"; rm -f "$TMP"; exit 1
fi
mv "$TMP" "$DEST/db/schoole-$TODAY.sql.gz"

# 2) uploaded files (student/employee photos, attachments) — the docker volume
docker run --rm -v schoole_schoole-api-storage:/data:ro -v "$DEST/files":/b alpine \
  tar czf "/b/storage-$TODAY.tgz" -C /data . 2>/dev/null

# 3) weekly copy on Sundays, then retention
[ "$(date +%u)" = 7 ] && cp -f "$DEST/db/schoole-$TODAY.sql.gz" "$DEST/weekly/"
find "$DEST/db"     -name 'schoole-*.sql.gz' -mtime +14 -delete
find "$DEST/files"  -name 'storage-*.tgz'    -mtime +14 -delete
find "$DEST/weekly" -name 'schoole-*.sql.gz' -mtime +60 -delete

log "ok db=$(du -h "$DEST/db/schoole-$TODAY.sql.gz" | cut -f1) files=$(du -h "$DEST/files/storage-$TODAY.tgz" | cut -f1)"
