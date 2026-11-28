#!/bin/sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

if [ "$PUID" = "0" ]; then
    exec "$@"
fi

groupmod -o -g "$PGID" app
usermod -o -u "$PUID" -g "$PGID" app
chown -R app:app /app/data

exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups "$@"
