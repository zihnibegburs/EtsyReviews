#!/usr/bin/env bash
# EtsyReviews — GitHub'a ilk push
# Önkoşul: gh auth login (bir kez)

set -euo pipefail
cd "$(dirname "$0")/.."

REPO_NAME="${1:-EtsyReviews}"
GITHUB_USER="${2:-zihnibegburs}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI yok. Kur: brew install gh"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Önce giriş yap: gh auth login"
  exit 1
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "origin zaten ayarlı: $(git remote get-url origin)"
else
  git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"
fi

# Repo yoksa oluştur
if ! gh repo view "${GITHUB_USER}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "Repo oluşturuluyor: ${GITHUB_USER}/${REPO_NAME}"
  gh repo create "${GITHUB_USER}/${REPO_NAME}" \
    --public \
    --description "Etsy review scraper Chrome extension with Spring Boot API and Paddle subscriptions"
fi

echo "Push ediliyor..."
git push -u origin main

echo ""
echo "Tamam: https://github.com/${GITHUB_USER}/${REPO_NAME}"
