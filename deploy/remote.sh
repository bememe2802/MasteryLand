#!/usr/bin/env bash
# Runs on the Oracle host as root, from a checkout of the repo: /opt/arenix/repo (deploy/pull-deploy.sh,
# every minute) or /opt/arenix/src (deploy/deploy.sh, by hand).
#   remote.sh           build and restart the game and its front door (arenix-edge, port 8443)
# Arenix shares nothing with other sites on the host: its own Docker network, proxy and certificate.
set -euo pipefail
cd "$(dirname "$0")/.."
NET=arenix-net
EDGE=/opt/arenix/edge

# Settings and secrets stay on the host in /opt/arenix/.env; releases never overwrite it.
if [ ! -f /opt/arenix/.env ]; then
  cat > /opt/arenix/.env <<ENV
GOOGLE_CLIENT_ID=
DEV_LOGIN=1
TRUST_PROXY=1
ALLOWED_ORIGINS=https://arenix.fun
MAX_PLAYERS=500
ENV
  chmod 600 /opt/arenix/.env
fi
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null

docker build -t arenix:latest .
docker rm -f arenix >/dev/null 2>&1 || true
docker run -d --name arenix --hostname arenix --restart unless-stopped   --network "$NET" --env-file /opt/arenix/.env   -v arenix_data:/app/data --memory 1g arenix:latest >/dev/null

for i in $(seq 1 30); do
  if docker exec arenix node -e "fetch('http://127.0.0.1:3000/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "game up"; break
  fi
  [ "$i" = 30 ] && { docker logs --tail 50 arenix; echo "GAME_DID_NOT_START" >&2; exit 1; }
  sleep 1
done

# Front door: Cloudflare connects here on 8443. The certificate is self-signed, made once, ten years.
mkdir -p "$EDGE"
if [ ! -f "$EDGE/cert.pem" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=arenix.fun"     -keyout "$EDGE/key.pem" -out "$EDGE/cert.pem" 2>/dev/null
  chmod 644 "$EDGE/cert.pem"; chmod 600 "$EDGE/key.pem"
fi
if ! cmp -s deploy/edge.conf "$EDGE/edge.conf" || [ "$(docker inspect --format '{{.State.Running}}' arenix-edge 2>/dev/null)" != true ]; then
  cp deploy/edge.conf "$EDGE/edge.conf"
  docker rm -f arenix-edge >/dev/null 2>&1 || true
  docker run -d --name arenix-edge --restart unless-stopped --network "$NET" -p 8443:8443     -v "$EDGE/edge.conf:/etc/nginx/conf.d/default.conf:ro"     -v "$EDGE/cert.pem:/etc/arenix/cert.pem:ro" -v "$EDGE/key.pem:/etc/arenix/key.pem:ro"     nginx:1.30.6-alpine >/dev/null
fi
for i in $(seq 1 20); do
  curl -fsk --resolve arenix.fun:8443:127.0.0.1 https://arenix.fun:8443/api/config >/dev/null && break
  [ "$i" = 20 ] && { docker logs --tail 30 arenix-edge; echo "EDGE_DID_NOT_START" >&2; exit 1; }
  sleep 1
done
bash deploy/firewall.sh
echo "DEPLOY_OK"
