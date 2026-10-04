#!/bin/sh
set -eu
port="${PORT:-10000}"
case "$port" in *[!0-9]*|'') echo 'Invalid PORT' >&2; exit 1;; esac
printf 'Listen %s\n' "$port" > /etc/apache2/ports.conf
sed -i "s/<VirtualHost \*:10000>/<VirtualHost *:$port>/" /etc/apache2/sites-available/000-default.conf
if [ "${MIGRATE_ON_START:-false}" = 'true' ]; then php backend/migrate.php; fi
exec apache2-foreground
