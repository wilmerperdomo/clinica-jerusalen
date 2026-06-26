#!/usr/bin/env bash
set -euo pipefail

echo "== Evolution API installer for Ubuntu 22.04/24.04 =="

if [ "$EUID" -ne 0 ]; then
  echo "Run as root: sudo bash install-ubuntu.sh"
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl gnupg ufw nginx certbot python3-certbot-nginx

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

mkdir -p /opt/evolution-api
cp docker-compose.yml /opt/evolution-api/docker-compose.yml

if [ ! -f /opt/evolution-api/.env ]; then
  cp .env.example /opt/evolution-api/.env
  echo
  echo "Edit /opt/evolution-api/.env before starting:"
  echo "  nano /opt/evolution-api/.env"
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Next steps:"
echo "1. Point your DNS A record to this server IP."
echo "2. Edit /opt/evolution-api/.env with your domain and secrets."
echo "3. Run: cd /opt/evolution-api && docker compose up -d"
echo "4. Configure nginx + HTTPS:"
echo "   bash /opt/evolution-api/setup-nginx.sh"
