#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/opt/evolution-api/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${EVOLUTION_DOMAIN:-}" ]; then
  echo "EVOLUTION_DOMAIN is empty in $ENV_FILE"
  exit 1
fi

cat >/etc/nginx/sites-available/evolution-api <<NGINX
server {
    listen 80;
    server_name ${EVOLUTION_DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/evolution-api /etc/nginx/sites-enabled/evolution-api
nginx -t
systemctl reload nginx

certbot --nginx -d "$EVOLUTION_DOMAIN" --redirect

echo "Evolution API should be available at: https://${EVOLUTION_DOMAIN}"
