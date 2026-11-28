#!/bin/sh
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# An unknown TZ crashes the scheduler at startup; fall back to UTC instead.
if [ -n "$TZ" ] && [ ! -f "/usr/share/zoneinfo/$TZ" ]; then
    echo "WARNING: unknown timezone TZ=$TZ, using Etc/UTC. Use a name like Asia/Tokyo." >&2
    export TZ=Etc/UTC
fi

if [ "$PUID" = "0" ]; then
    exec "$@"
fi

groupmod -o -g "$PGID" app
usermod -o -u "$PUID" -g "$PGID" app
chown -R app:app /app/data

exec setpriv --reuid="$PUID" --regid="$PGID" --init-groups "$@"
