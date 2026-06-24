#!/usr/bin/env bash
# Time4VPS ilk kurulum — root olarak çalıştır:
#   curl -fsSL https://raw.githubusercontent.com/.../setup-vps.sh | bash
# veya repo klonlandıktan sonra:
#   sudo bash scripts/setup-vps.sh

set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Bu script root olarak çalıştırılmalı: sudo bash scripts/setup-vps.sh"
  exit 1
fi

echo "==> Sistem güncelleniyor..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

echo "==> Gerekli paketler..."
apt-get install -y -qq ca-certificates curl git ufw

echo "==> Docker kuruluyor..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable docker
systemctl start docker

echo "==> Firewall (UFW)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Swap (1 GB RAM VPS için önerilir)..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 1G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=1024
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
fi

echo ""
echo "Kurulum tamam."
echo "Sonraki adımlar:"
echo "  1. git clone <repo-url> /opt/etsy-reviews && cd /opt/etsy-reviews"
echo "  2. cp .env.production.example .env && nano .env"
echo "  3. DNS: API_DOMAIN -> bu sunucunun IP adresi"
echo "  4. bash scripts/deploy-prod.sh"
