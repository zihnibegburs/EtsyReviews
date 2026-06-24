# Lemon Squeezy Kurulum Rehberi

Abonelik ödemeleri **Lemon Squeezy Checkout** ile çalışır.

## Akış

```
Uzantı → POST /api/lemonsqueezy/checkout → Lemon Squeezy hosted checkout
       → ödeme tamamlanır
       → Lemon Squeezy webhook → POST /api/lemonsqueezy/webhook
       → DB'de subscription ACTIVE
       → Uzantı GET /api/subscription/me
```

---

## 1. Lemon Squeezy hesabı

1. https://lemonsqueezy.com
2. **Store** oluştur
3. Test mode ile başla

---

## 2. Ürün ve variant oluştur

1. **Products** → yeni ürün: `Etsy Reviews PRO`
2. İki **subscription variant** ekle:
   - Monthly: $8/month
   - Yearly: $70/year
3. **Store ID** ve her variant'ın **ID**'sini kopyala

---

## 3. API anahtarı

**Settings** → **API** → Create API key

| Key | Nereye |
|-----|--------|
| API key | `LEMONSQUEEZY_API_KEY` |
| Store ID | `LEMONSQUEEZY_STORE_ID` |
| Variant ID (monthly) | `LEMONSQUEEZY_VARIANT_ID_MONTHLY` |
| Variant ID (yearly) | `LEMONSQUEEZY_VARIANT_ID_YEARLY` |

---

## 4. Backend ayarları

`backend/src/main/resources/application-local.properties`:

```properties
lemonsqueezy.api-key=...
lemonsqueezy.store-id=...
lemonsqueezy.webhook-secret=...
lemonsqueezy.variant-id-monthly=...
lemonsqueezy.variant-id-yearly=...
lemonsqueezy.success-url=http://localhost:8081/checkout/success?success=1
lemonsqueezy.cancel-url=http://localhost:8081/checkout/cancel
```

Render'da aynı değişkenleri `LEMONSQUEEZY_*` env olarak tanımla.

---

## 5. Webhook kurulumu

Local'de `localhost:8081` Lemon Squeezy'den erişilemez. **ngrok** ile geçici public URL aç:

```bash
ngrok http 8081
```

**Lemon Squeezy Dashboard** → **Settings** → **Webhooks** → **Add webhook**:

| Alan | Değer |
|------|--------|
| URL | `https://abc123.ngrok-free.app/api/lemonsqueezy/webhook` |
| Events | `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_expired`, `subscription_resumed`, `subscription_payment_success`, `order_created` |
| Signing secret | Oluşan secret → `LEMONSQUEEZY_WEBHOOK_SECRET` |

Production: `https://etsy-backend-u3x2.onrender.com/api/lemonsqueezy/webhook`

---

## 6. Test

1. Backend çalışıyor olsun
2. Uzantıda login ol
3. Checkout sayfasından plan seç
4. Lemon Squeezy test modunda ödeme yap
5. `GET /api/subscription/me` → `ACTIVE`
6. Debug: `GET /api/lemonsqueezy/events` ve `GET /api/lemonsqueezy/payments` (JWT gerekli)

---

## API Endpoints

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/lemonsqueezy/config` | Variant ID'ler |
| `POST /api/lemonsqueezy/checkout` | Checkout URL oluştur |
| `POST /api/lemonsqueezy/webhook` | Lemon Squeezy eventleri |
| `POST /api/subscription/cancel` | Dönem sonunda iptal |
| `POST /api/subscription/reactivate` | İptali geri al |
| `POST /api/subscription/upgrade` | Aylık → yıllık |
