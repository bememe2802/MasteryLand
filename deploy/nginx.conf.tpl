# Arenix behind Flath's Nginx. deploy/remote.sh writes this file to /opt/nginx-extra/arenix.conf:
# with no certificate yet only the HTTP block (which also proxies), with one the HTTPS blocks too.
server {
    listen 80;
    server_name arenix.fun www.arenix.fun;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        #HTTP_ONLY set $arenix http://arenix:3000;
        #HTTP_ONLY proxy_pass $arenix;
        #HTTP_ONLY proxy_http_version 1.1;
        #HTTP_ONLY proxy_set_header Host $host;
        #HTTP_ONLY proxy_set_header X-Forwarded-For $remote_addr;
        #HTTP_ONLY proxy_set_header X-Forwarded-Proto $scheme;
        #HTTP_ONLY proxy_set_header Upgrade $http_upgrade;
        #HTTP_ONLY proxy_set_header Connection $connection_upgrade;
        #HTTP_ONLY proxy_read_timeout 3600s;
        #TLS return 301 https://arenix.fun$request_uri;
    }
}

#TLS server {
#TLS     listen 443 ssl;
#TLS     server_name arenix.fun www.arenix.fun;
#TLS
#TLS     if ($host = www.arenix.fun) {
#TLS         return 301 https://arenix.fun$request_uri;
#TLS     }
#TLS
#TLS     ssl_certificate /etc/letsencrypt/live/arenix.fun/fullchain.pem;
#TLS     ssl_certificate_key /etc/letsencrypt/live/arenix.fun/privkey.pem;
#TLS     ssl_protocols TLSv1.2 TLSv1.3;
#TLS
#TLS     location / {
#TLS         set $arenix http://arenix:3000;
#TLS         proxy_pass $arenix;
#TLS         proxy_http_version 1.1;
#TLS         proxy_set_header Host $host;
#TLS         proxy_set_header X-Forwarded-For $remote_addr;
#TLS         proxy_set_header X-Forwarded-Proto $scheme;
#TLS         proxy_set_header Upgrade $http_upgrade;
#TLS         proxy_set_header Connection $connection_upgrade;
#TLS         # Game sockets stay open for a whole play session.
#TLS         proxy_read_timeout 3600s;
#TLS         proxy_send_timeout 3600s;
#TLS     }
#TLS }
