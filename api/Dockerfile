# Schoole API — Laravel 13 on PHP 8.4
FROM php:8.4-cli

RUN apt-get update \
    && apt-get install -y --no-install-recommends libzip-dev libpng-dev libjpeg-dev libonig-dev unzip \
    && docker-php-ext-configure gd --with-jpeg \
    && docker-php-ext-install pdo_mysql bcmath gd \
    && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

EXPOSE 8000

# Boot: install deps if missing, ensure .env + app key, link storage, wait for
# DB, migrate (and seed on first run), then serve. Code is bind-mounted.
CMD ["sh", "-c", "\
    [ -d vendor ] || composer install --no-interaction --prefer-dist --optimize-autoloader; \
    [ -f .env ] || cp .env.example .env; \
    grep -q '^APP_KEY=base64' .env || php artisan key:generate --force; \
    set_env() { grep -q \"^$1=\" .env && sed -i \"s|^$1=.*|$1=$2|\" .env || echo \"$1=$2\" >> .env; }; \
    [ -n \"$DB_CONNECTION\" ] && set_env DB_CONNECTION \"$DB_CONNECTION\"; \
    [ -n \"$DB_HOST\" ] && set_env DB_HOST \"$DB_HOST\"; \
    [ -n \"$DB_PORT\" ] && set_env DB_PORT \"$DB_PORT\"; \
    [ -n \"$DB_DATABASE\" ] && set_env DB_DATABASE \"$DB_DATABASE\"; \
    [ -n \"$DB_USERNAME\" ] && set_env DB_USERNAME \"$DB_USERNAME\"; \
    [ -n \"$DB_PASSWORD\" ] && set_env DB_PASSWORD \"$DB_PASSWORD\"; \
    [ -n \"$APP_ENV\" ] && set_env APP_ENV \"$APP_ENV\"; \
    [ -n \"$APP_URL\" ] && set_env APP_URL \"$APP_URL\"; \
    php artisan storage:link --force || true; \
    until php artisan migrate --force 2>/dev/null; do echo 'waiting for db...'; sleep 3; done; \
    php artisan db:seed --force || true; \
    php artisan config:clear || true; \
    php artisan serve --host=0.0.0.0 --port=8000 \
"]
