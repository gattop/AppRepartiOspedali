#!/bin/sh
# Starts as root only to make the data directory writable (it is usually a bind mount
# like ./data created by Docker as root), then runs the app as the unprivileged "node" user.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR"
  exec su-exec node "$@"
fi
exec "$@"
