#!/bin/sh
# Probes http://127.0.0.1:8080/ - if healthy, exit 0 immediately
if curl -s -f http://127.0.0.1:8080/ >/dev/null 2>&1; then
  exit 0
fi

# CITYDESK_HOME defaults to the folder this script lives in (the repo root).
CITYDESK_HOME="${CITYDESK_HOME:-$(cd "$(dirname "$0")" && pwd)}"
cd "$CITYDESK_HOME" || exit 1

# Start dev server in the background bound to 0.0.0.0:8080
env -u NODE_CHANNEL_FD -u NODE_CHANNEL_SERIALIZATION_MODE npm run dev > "$CITYDESK_HOME/.dev-server.log" 2>&1 &

# Brief poll to confirm it started
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -f http://127.0.0.1:8080/ >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

exit 0
