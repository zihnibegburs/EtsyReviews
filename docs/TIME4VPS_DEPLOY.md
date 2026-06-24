# Time4VPS Production Kurulum

Backend + PostgreSQL + HTTPS (Caddy) tek sunucuda Docker ile çalışır.

## Gereksinimler

| | |
|---|---|
| **VPS** | Time4VPS 2 GB RAM (önerilen) veya 1 GB (sıkışık) |
| **OS** | Ubuntu 22.04 / 24.04 |
| **Domain** | Örn. `api.etsyfetcher.shop` → VPS IP (A kaydı) |
| **Repo** | GitHub veya sunucuya dosya kopyası |

---

## 1. VPS'e bağlan

```bash
ssh root@SUNUCU_IP
```

---

## 2. İlk sunucu kurulumu

```bash
apt-get update && apt-get install -y git
git clone https://github.com/zihnibegburs/EtsyReviews.git /opt/etsy-reviews
cd /opt/etsy-reviews
chmod +x scripts/setup-vps.sh scripts/deploy-prod.sh
sudo bash scripts/setup-vps.sh
```

`setup-vps.sh` şunları yapar:
- Docker kurar
- UFW: 22, 80, 443 açık
- 1 GB swap ekler (RAM sıkışırsa)

---

## 3. DNS ayarı

Domain sağlayıcında:

| Tip | Ad | Değer |
|-----|-----|-------|
| A | `api` | `SUNUCU_IP` |

Propagasyon 5–30 dk sürebilir. Kontrol:

```bash
dig +short api.etsyfetcher.shop
```

---

## 4. Ortam değişkenleri (.env)

```bash
cd /opt/etsy-reviews
cp .env.production.example .env
nano .env
```

Doldurulması zorunlu alanlar:

```env
API_DOMAIN=api.etsyfetcher.shop
POSTGRES_PASSWORD=güçlü-rastgele-şifre
JWT_SECRET=en-az-32-karakterlik-gizli-anahtar
GOOGLE_CLIENT_ID=extension-manifest-ile-aynı-client-id
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_STORE_ID=...
LEMONSQUEEZY_WEBHOOK_SECRET=...
LEMONSQUEEZY_VARIANT_ID_MONTHLY=...
LEMONSQUEEZY_VARIANT_ID_YEARLY=...
LEMONSQUEEZY_SUCCESS_URL=https://api.etsyfetcher.shop/checkout/success?success=1
LEMONSQUEEZY_CANCEL_URL=https://api.etsyfetcher.shop/checkout/cancel
```

`GOOGLE_CLIENT_ID` → `extension/manifest.json` içindeki `oauth2.client_id` ile **birebir aynı** olmalı.

---

## 5. Deploy

```bash
cd /opt/etsy-reviews
bash scripts/deploy-prod.sh
```

İlk build 5–10 dk sürebilir (Gradle + JAR).

Kontrol:

```bash
curl -s https://api.etsyfetcher.shop/health
# {"status":"UP"} benzeri yanıt
```

---

## 6. Lemon Squeezy webhook

Dashboard → **Settings → Webhooks** → URL güncelle:

```
https://api.etsyfetcher.shop/api/lemonsqueezy/webhook
```

Events: `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`

Signing secret → `.env` içindeki `LEMONSQUEEZY_WEBHOOK_SECRET` ile aynı.

---

## 7. Extension

`extension/utils/config.js` production URL zaten `https://api.etsyfetcher.shop/api` ise değişiklik gerekmez.

Farklı domain kullanıyorsan `BASE_URL` ve extension'ı yeniden build/publish et.

---

## Günlük komutlar

```bash
cd /opt/etsy-reviews

# Loglar
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f caddy

# Durum
docker compose -f docker-compose.prod.yml ps

# Yeniden deploy (kod güncellemesi)
git pull
bash scripts/deploy-prod.sh

# Durdur / başlat
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d
```

---

## RAM izleme

```bash
free -h
docker stats --no-stream
```

**2 GB VPS (senin makine):** varsayılan `JAVA_OPTS=-Xmx512m -Xms256m` yeterli.

1 GB VPS'te:

```env
JAVA_OPTS=-Xmx384m -Xms128m -XX:+UseSerialGC
```

---

## Veritabanı yedeği

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U etsy etsy_extension > backup-$(date +%F).sql
```

Geri yükleme:

```bash
cat backup-2026-06-24.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U etsy etsy_extension
```

---

## Sorun giderme

| Sorun | Çözüm |
|-------|--------|
| SSL sertifikası alınamıyor | DNS A kaydı doğru mu? `dig +short API_DOMAIN` |
| Backend restart döngüsü | `docker logs etsy-backend` — muhtemelen RAM; `JAVA_OPTS` düşür |
| 502 Bad Gateway | Backend henüz ayağa kalkmamış; `docker compose ... logs backend` |
| Login 401 / token hatası | `GOOGLE_CLIENT_ID` manifest ile uyuşmuyor |
| Webhook çalışmıyor | URL HTTPS mi? Secret `.env` ile aynı mı? |

---

## Mimari

```
Internet :443
    ↓
  Caddy (Let's Encrypt)
    ↓
  backend:8081 (Spring Boot)
    ↓
  postgres:5432
```

Postgres internete açılmaz; sunucuda sadece `127.0.0.1:5432` üzerinden erişilebilir (SSH tüneli için).

Mac'ten TablePlus / DBeaver:

```bash
ssh -L 5434:127.0.0.1:5432 root@SUNUCU_IP -N
```

Bağlantı: `localhost:5434`, DB `etsy_extension`, user `etsy`.
