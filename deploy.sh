#!/bin/bash
# Auto-deploy for schoole (cron every minute). Pulls origin/main, rebuilds container only on change.
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
docker compose up -d --build >> /opt/schoole/deploy.log 2>&1
echo "$REMOTE" > .last_deployed
echo "$(date) done" >> /opt/schoole/deploy.log
