#!/usr/bin/env bash
# Runs on the Oracle host as root, from a checkout of the repo: /opt/arenix/repo (deploy/pull-deploy.sh,
# every minute) or /opt/arenix/src (deploy/deploy.sh, by hand).
#   remote.sh           build and restart the game, refresh the Nginx site
#   remote.sh cert       also ask Let's Encrypt for arenix.fun (DNS must point here first); it uses
#                        the Let's Encrypt account Flath already registered on this host
set -euo pipefail
cd "$(dirname "$0")/.."
NET=flath_flath-network
EXTRA=/opt/nginx-extra
WEBROOT=/opt/flath/deploy/prod/certbot/www
LIVE=/etc/letsencrypt/live/arenix.fun

# Settings and secrets stay on the host in /opt/arenix/.env; releases never overwrite it.
if [ ! -f /opt/arenix/.env ]; then
  cat > /opt/arenix/.env <<ENV
GOOGLE_CLIENT_ID=
DEV_LOGIN=1
TRUST_PROXY=1
ALLOWED_ORIGINS=https://arenix.fun,http://arenix.fun
MAX_PLAYERS=500
ENV
  chmod 600 /opt/arenix/.env
fi

docker build -t arenix:latest .
docker rm -f arenix >/dev/null 2>&1 || true
docker run -d --name arenix --hostname arenix --restart unless-stopped \
  --network "$NET" --env-file /opt/arenix/.env \
  -v arenix_data:/app/data --memory 1g arenix:latest >/dev/null

for i in $(seq 1 30); do
  if docker exec arenix node -e "fetch('http://127.0.0.1:3000/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "game up"; break
  fi
  [ "$i" = 30 ] && { docker logs --tail 50 arenix; echo "GAME_DID_NOT_START" >&2; exit 1; }
  sleep 1
done

site() {  # $1 = http | tls
  mkdir -p "$EXTRA"
  if [ "$1" = tls ]; then sed -e '/#HTTP_ONLY/d' -e 's/^\(\s*\)#TLS \?/\1/' deploy/nginx.conf.tpl
  else sed -e '/#TLS/d' -e 's/#HTTP_ONLY //' deploy/nginx.conf.tpl; fi > "$EXTRA/arenix.conf.new"
  mv "$EXTRA/arenix.conf" "$EXTRA/arenix.conf.bak" 2>/dev/null || true
  mv "$EXTRA/arenix.conf.new" "$EXTRA/arenix.conf"
  # A broken site must never take Flath down: test first, roll back on failure.
  if docker exec flath-nginx nginx -t >/dev/null 2>&1; then
    docker exec flath-nginx nginx -s reload
  else
    docker exec flath-nginx nginx -t || true
    if [ -f "$EXTRA/arenix.conf.bak" ]; then mv "$EXTRA/arenix.conf.bak" "$EXTRA/arenix.conf"; else rm -f "$EXTRA/arenix.conf"; fi
    echo "NGINX_TEST_FAILED, previous site kept" >&2; exit 1
  fi
}

if [ "${1:-}" = cert ]; then
  site http
  certbot certonly --webroot -w "$WEBROOT" -d arenix.fun -d www.arenix.fun \
    --cert-name arenix.fun --non-interactive --keep-until-expiring
fi
if [ -f "$LIVE/fullchain.pem" ]; then site tls; else site http; fi
echo "DEPLOY_OK"
