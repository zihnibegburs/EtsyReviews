# Paddle Kurulum Rehberi

Abonelik ödemeleri **Paddle Billing** ile çalışır (Default Payment Link + Paddle.js — Hosted Checkout onayı gerekmez).

## Akış

```
Uzantı → POST /api/paddle/checkout → transaction oluşturulur
       → checkout.url döner (…/checkout/pay?_ptxn=txn_…)
       → Paddle.js overlay ile ödeme
       → Paddle webhook → POST /api/paddle/webhook
       → DB'de subscription ACTIVE
       → Uzantı GET /api/subscription/me
```

---

## 1. Paddle hesabı

1. https://vendors.paddle.com/
2. Sandbox ile başla (test için)
3. **Checkout → Website approval** — domain onayı (production için)

---

## 2. Default payment link (zorunlu)

Hosted Checkout yerine kendi domain'inizde Paddle.js kullanılır.

1. Paddle Dashboard → **Checkout → Checkout settings → Default payment link**
2. Değer: `https://api.etsyfetcher.shop/checkout/pay` (local: `http://localhost:8081/checkout/pay` veya ngrok URL)
3. Backend config ile **aynı URL** olmalı:

```properties
paddle.checkout-url=https://api.etsyfetcher.shop/checkout/pay
paddle.client-token=test_...   # sandbox client-side token
```

`/checkout/pay` sayfası backend'de Paddle.js ile sunulur; `?_ptxn=` parametresi gelince checkout otomatik açılır.

Parametreler: [Default payment link](https://developer.paddle.com/build/transactions/default-payment-link)

---

## 3. Ürün ve price oluştur

1. **Catalog → Products** → yeni ürün: `Etsy Reviews PRO`
2. İki **subscription price** ekle:
   - Monthly: $9.99/month
   - Yearly: $99.99/year
3. Her price'ın **ID**'sini kopyala (`pri_...`)

---

## 4. API anahtarı ve client token

**Developer tools → Authentication**

| Key | Nereye |
|-----|--------|
| API key | `PADDLE_API_KEY` |
| Client-side token (sandbox: `test_…`, live: `live_…`) | `PADDLE_CLIENT_TOKEN` |
| Environment | `PADDLE_ENVIRONMENT` (`sandbox` veya `production`) |
| Price ID (monthly) | `PADDLE_PRICE_ID_MONTHLY` |
| Price ID (yearly) | `PADDLE_PRICE_ID_YEARLY` |
| Checkout page URL | `PADDLE_CHECKOUT_URL` (= Default payment link) |
| Webhook secret | `PADDLE_WEBHOOK_SECRET` |

---

## 5. Backend ayarları

`backend/src/main/resources/application-local.properties`:

```properties
paddle.api-key=...
paddle.environment=sandbox
paddle.webhook-secret=pdl_ntfset_01xxxxxxxx_xxxxxxxxxxxxxxxxxxxxxxxx
paddle.price-id-monthly=pri_...
paddle.price-id-yearly=pri_...
paddle.checkout-url=http://localhost:8081/checkout/pay
paddle.client-token=test_...
paddle.success-url=http://localhost:8081/checkout/success?success=1
paddle.cancel-url=http://localhost:8081/checkout/cancel
```

Production'da aynı değişkenleri `PADDLE_*` env olarak tanımla.

---

## 6. Webhook

Paddle Dashboard → **Developer tools → Notifications**

| Alan | Değer |
|------|-------|
| URL | `https://api.etsyfetcher.shop/api/paddle/webhook` |
| Events | `subscription.*`, `transaction.completed` |
| Secret | Destination **secret key** alanı (`pdl_ntfset_...` ile başlar — `ntfset_...` ID değil) |

Local test için ngrok:

```
https://abc123.ngrok-free.app/api/paddle/webhook
```

---

## 7. Test

1. Backend başlat: `./scripts/start-backend.sh`
2. Extension'ı reload et
3. Login ol → Upgrade to PRO
4. Sandbox test kartı: `4242 4242 4242 4242`, expiry `12/30`, CVC `123`
5. Webhook sonrası PRO badge görünmeli

Debug: `GET /api/paddle/events` (JWT gerekli)

---

## API Endpoints

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/paddle/config` | Price ID'ler |
| `POST /api/paddle/checkout` | Checkout URL oluştur (`checkout.url`) |
| `GET /checkout/pay` | Paddle.js checkout sayfası |
| `POST /api/paddle/webhook` | Paddle eventleri |
| `POST /api/subscription/cancel` | Dönem sonunda iptal |
| `POST /api/subscription/reactivate` | İptali geri al |
| `POST /api/subscription/upgrade` | Aylık → yıllık |

Detaylı entegrasyon: `docs/PADDLE_INTEGRATION.md`
