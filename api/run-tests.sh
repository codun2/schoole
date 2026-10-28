#!/usr/bin/env bash
# Run the Laravel test suite SAFELY on the production host.
#
# The API container is bind-mounted to the live app and docker-compose injects DB_CONNECTION=mysql /
# APP_ENV=production as real process env vars. Laravel reads $_SERVER before phpunit.xml's <env>
# overrides, so a plain `php artisan test` would resolve to the PRODUCTION MySQL and RefreshDatabase
# would `migrate:fresh` it. Setting the vars at the process level (-e) is the only deterministic fix;
# tests/TestCase.php additionally refuses to boot unless the DB is sqlite :memory:.
#
# Usage: ./run-tests.sh [phpunit/artisan test args...]   e.g. ./run-tests.sh tests/Feature/AuthTest.php
set -euo pipefail
cd "$(dirname "$0")"
docker exec \
  -e APP_ENV=testing \
  -e DB_CONNECTION=sqlite \
  -e DB_DATABASE=:memory: \
  -e CACHE_STORE=array -e SESSION_DRIVER=array -e QUEUE_CONNECTION=sync \
  schoole-api php artisan test "$@"
