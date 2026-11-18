#!/usr/bin/env bash
# From the project folder: bash deploy/deploy.sh
# Packs the working tree, copies it to the Oracle host and runs deploy/remote.sh there.
set -euo pipefail
HOST="${ARENIX_HOST:-ubuntu@134.185.93.138}"
KEY="${ARENIX_KEY:-$HOME/.ssh/flath_oracle}"
cd "$(dirname "$0")/.."
tar --exclude=node_modules --exclude=dist --exclude=data --exclude=.env --exclude=.git --exclude=.claude \
  -czf /tmp/arenix-src.tgz .
scp -i "$KEY" -q /tmp/arenix-src.tgz "$HOST:/tmp/arenix-src.tgz"
ssh -i "$KEY" "$HOST" "sudo bash -c 'rm -rf /opt/arenix/src && mkdir -p /opt/arenix/src && tar -xzf /tmp/arenix-src.tgz -C /opt/arenix/src && sed -i \"s/\r\$//\" /opt/arenix/src/deploy/*.sh && bash /opt/arenix/src/deploy/remote.sh $*'"
