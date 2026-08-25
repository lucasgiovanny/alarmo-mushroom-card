#!/bin/sh
# Copy the card to Home Assistant and print the cache-busted resource URL.
#
# The Home Assistant frontend caches module resources hard enough that a plain
# refresh keeps serving yesterday's file, so the version query is not optional.
set -e
HOST="${HA_HOST:-homeassistant.local}"
USER="${HA_USER:-root}"
DEST="/config/www/community/alarmo-mushroom-card"

ssh "$USER@$HOST" "mkdir -p $DEST"
scp dist/alarmo-mushroom-card.js "$USER@$HOST:$DEST/alarmo-mushroom-card.js"

echo
echo "Resource URL (Settings -> Dashboards -> Resources, type: JavaScript Module):"
echo "  /local/community/alarmo-mushroom-card/alarmo-mushroom-card.js?v=$(date +%s)"
