#!/usr/bin/env bash
# Only Cloudflare may open connections to Arenix's port 8443. Docker-published ports skip the host's
# INPUT rules, so the filter sits in DOCKER-USER. Idempotent: rebuilt from scratch on every run.
set -euo pipefail
CF="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18
190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"
iptables -N ARENIX-8443 2>/dev/null || iptables -F ARENIX-8443
iptables -A ARENIX-8443 -s 127.0.0.0/8 -j RETURN
for r in $CF; do iptables -A ARENIX-8443 -s "$r" -j RETURN; done
iptables -A ARENIX-8443 -j DROP
iptables -C DOCKER-USER -p tcp -m conntrack --ctorigdstport 8443 --ctstate NEW -j ARENIX-8443 2>/dev/null \
  || iptables -I DOCKER-USER -p tcp -m conntrack --ctorigdstport 8443 --ctstate NEW -j ARENIX-8443
