#!/bin/sh
# Starts as root only to make the data directory writable (it is usually a bind mount
# like ./data created by Docker as root), then runs the app as the unprivileged "node" user.
set -e
if [ "$(id -u)" = "0" ]; then
  for dir in "$DATA_DIR" "$BACKUP_DIR"; do
    [ -n "$dir" ] || continue
    mkdir -p "$dir"
    chown -R node:node "$dir"
  done
  exec su-exec node "$@"
fi
exec "$@"
