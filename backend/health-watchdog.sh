#!/bin/sh
# Run from cron every minute on the EC2 host, as the same user that owns PM2.
set -eu
state="${XDG_RUNTIME_DIR:-/tmp}/buscagames-health-failures"
if curl --silent --show-error --fail --max-time 8 http://127.0.0.1:3001/api/health | grep -q '"ok":true'; then
  printf '0\n' > "$state"
  exit 0
fi
failures=$(cat "$state" 2>/dev/null || printf '0')
case "$failures" in ''|*[!0-9]*) failures=0;; esac
failures=$((failures + 1))
printf '%s\n' "$failures" > "$state"
if [ "$failures" -ge 3 ]; then
  logger -t buscagames-watchdog 'API failed three local health checks; restarting PM2 process'
  pm2 restart buscagames-api
  printf '0\n' > "$state"
fi
