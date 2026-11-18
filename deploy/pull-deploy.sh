#!/usr/bin/env bash
# Continuous deployment, run by cron every minute on the Oracle host (root):
# fetch main, and when it moved, build and restart the game from that commit.
# The repo is public, so the host reads it over HTTPS with no key at all.
# A failed build leaves the running game as it was and is retried on the next commit.
set -euo pipefail
REPO=/opt/arenix/repo
LOG=/var/log/arenix-deploy.log
exec 9>/run/arenix-deploy.lock
flock -n 9 || exit 0
cd "$REPO"
git fetch -q origin main
NEW=$(git rev-parse origin/main)
OLD=$(cat /opt/arenix/DEPLOYED 2>/dev/null || true)
[ "$NEW" = "$OLD" ] && exit 0
{
  echo "=== $(date -Is) deploying $NEW (was ${OLD:-none})"
  git reset -q --hard "$NEW"
  if bash deploy/remote.sh; then echo "$NEW" > /opt/arenix/DEPLOYED; echo "=== ok $NEW"
  else echo "=== FAILED $NEW"; echo "$NEW" > /opt/arenix/FAILED; fi
} >> "$LOG" 2>&1
