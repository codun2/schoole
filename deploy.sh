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

# Safety: this server is also where the code is edited. Never hard-reset over
# local commits that origin doesn't have yet, or over uncommitted tracked changes —
# that would silently destroy work. Push/commit first, then deploy resumes on its own.
AHEAD=$(git rev-list --count origin/main..main 2>/dev/null || echo 0)
DIRTY=$(git status --porcelain --untracked-files=no | wc -l)
if [ "$AHEAD" != "0" ] || [ "$DIRTY" != "0" ]; then
  echo "$(date) SKIP deploy of $REMOTE: local main is $AHEAD commit(s) ahead, $DIRTY uncommitted tracked file(s)" >> /opt/schoole/deploy.log
  exit 0
fi

echo "$(date) deploying $REMOTE" >> /opt/schoole/deploy.log
git reset --hard origin/main
docker compose up -d --build --remove-orphans >> /opt/schoole/deploy.log 2>&1
sleep 8
docker compose exec -T schoole-api php artisan migrate --force >> /opt/schoole/deploy.log 2>&1 || true
docker compose exec -T schoole-api php artisan config:clear >> /opt/schoole/deploy.log 2>&1 || true
echo "$REMOTE" > .last_deployed
echo "$(date) done" >> /opt/schoole/deploy.log
