# Paddle Kurulum Rehberi

Abonelik ödemeleri **Paddle Billing** ile çalışır.

## Akış

```
Uzantı → POST /api/paddle/checkout → Paddle hosted checkout
       → ödeme tamamlanır
       → Paddle webhook → POST /api/paddle/webhook
       → DB'de subscription ACTIVE
       → Uzantı GET /api/subscription/me
```

---

## 1. Paddle hesabı

1. https://vendors.paddle.com/
2. Sandbox ile başla (test için)
3. **Checkout → Checkout settings → Default payment link** ayarla (onaylı domain gerekli)

---

## 2. Ürün ve price oluştur

1. **Catalog → Products** → yeni ürün: `Etsy Reviews PRO`
2. İki **subscription price** ekle:
   - Monthly: $9.99/month
   - Yearly: $99.99/year
3. Her price'ın **ID**'sini kopyala (`pri_...`)

---

## 3. API anahtarı

**Developer tools → Authentication** → API key oluştur

| Key | Nereye |
|-----|--------|
| API key | `PADDLE_API_KEY` |
| Environment | `PADDLE_ENVIRONMENT` (`sandbox` veya `production`) |
| Price ID (monthly) | `PADDLE_PRICE_ID_MONTHLY` |
| Price ID (yearly) | `PADDLE_PRICE_ID_YEARLY` |
| Webhook secret | `PADDLE_WEBHOOK_SECRET` |

---

## 4. Backend ayarları

`backend/src/main/resources/application-local.properties`:

```properties
paddle.api-key=...
paddle.environment=sandbox
paddle.webhook-secret=...
paddle.price-id-monthly=pri_...
paddle.price-id-yearly=pri_...
paddle.success-url=http://localhost:8081/checkout/success?success=1
paddle.cancel-url=http://localhost:8081/checkout/cancel
```

Production'da aynı değişkenleri `PADDLE_*` env olarak tanımla.

---

## 5. Webhook

Paddle Dashboard → **Developer tools → Notifications**

| Alan | Değer |
|------|-------|
| URL | `https://api.etsyfetcher.shop/api/paddle/webhook` |
| Events | `subscription.*`, `transaction.completed` |
| Secret | `.env` içindeki `PADDLE_WEBHOOK_SECRET` ile aynı |

Local test için ngrok:

```
https://abc123.ngrok-free.app/api/paddle/webhook
```

---

## 6. Test

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
| `POST /api/paddle/checkout` | Checkout URL oluştur |
| `POST /api/paddle/webhook` | Paddle eventleri |
| `POST /api/subscription/cancel` | Dönem sonunda iptal |
| `POST /api/subscription/reactivate` | İptali geri al |
| `POST /api/subscription/upgrade` | Aylık → yıllık |

Detaylı entegrasyon: `docs/PADDLE_INTEGRATION.md`
