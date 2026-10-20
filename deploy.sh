#!/bin/bash
# سكوول (schoole) auto-deploy — cron every minute (flock-guarded).
# Pulls origin/main when it moves, rebuilds the stack, runs migrations.
set -e
cd /opt/schoole
exec 9>/tmp/schoole-deploy.lock
flock -n 9 || exit 0

git fetch -q origin main
REMOTE=$(git rev-parse origin/main)
LOCAL=$(cat .last_deployed 2>/dev/null || echo none)
[ "$REMOTE" = "$LOCAL" ] && exit 0

echo "$(date) deploying $REMOTE" >> /opt/schoole/deploy.log
git reset --hard origin/main
docker compose up -d --build --remove-orphans >> /opt/schoole/deploy.log 2>&1
sleep 8
docker compose exec -T schoole-api php artisan migrate --force >> /opt/schoole/deploy.log 2>&1 || true
docker compose exec -T schoole-api php artisan config:clear >> /opt/schoole/deploy.log 2>&1 || true
echo "$REMOTE" > .last_deployed
echo "$(date) done" >> /opt/schoole/deploy.log
