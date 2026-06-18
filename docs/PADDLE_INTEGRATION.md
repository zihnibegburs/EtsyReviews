# 🚀 Paddle Entegrasyon Rehberi

Bu döküman, Chrome Extension'ın Paddle ile nasıl entegre olduğunu ve production'a nasıl geçileceğini açıklar.

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Akış Diyagramı](#akış-diyagramı)
3. [Frontend Entegrasyonu](#frontend-entegrasyonu)
4. [Backend Entegrasyonu](#backend-entegrasyonu)
5. [Webhook Kurulumu](#webhook-kurulumu)
6. [Production'a Geçiş](#productiona-geçiş)
7. [Test Senaryoları](#test-senaryoları)

---

## 🎯 Genel Bakış

Extension, Paddle Billing API kullanarak subscription yönetimi yapıyor. İki plan mevcut:

- **Monthly Plan**: $9.99/ay
- **Yearly Plan**: $99.99/yıl (2 ay bedava)

### Kullanılan Teknolojiler:
- **Paddle Billing API** (v1)
- **Paddle Checkout** (Hosted payment page)
- **Paddle Webhooks** (Event notifications)

---

## 🔄 Akış Diyagramı

```
┌─────────────┐
│  Extension  │
│   (popup)   │
└──────┬──────┘
       │
       │ 1. User clicks "Upgrade to PRO"
       ▼
┌─────────────┐
│ checkout.   │
│    html     │
└──────┬──────┘
       │
       │ 2. User selects plan (Monthly/Yearly)
       ▼
┌─────────────┐
│   Paddle    │
│  Checkout   │
│   (Hosted)  │
└──────┬──────┘
       │
       │ 3. User completes payment
       ▼
┌─────────────┐
│   Paddle    │
│   Webhook   │
└──────┬──────┘
       │
       │ 4. POST /api/paddle/webhook
       ▼
┌─────────────┐
│   Backend   │
│ (Spring)    │
└──────┬──────┘
       │
       │ 5. Save subscription to DB
       │    (Match user by email)
       ▼
┌─────────────┐
│  Database   │
│ (Postgres)  │
└─────────────┘
       │
       │ 6. Extension checks status
       │    GET /api/subscription/me
       ▼
┌─────────────┐
│  Extension  │
│ (PRO Badge) │
└─────────────┘
```

---

## 💻 Frontend Entegrasyonu

### checkout.html

Kullanıcı bu sayfada plan seçer ve Paddle Checkout'a yönlendirilir.

**Önemli Değişkenler:**
```javascript
// Environment (sandbox veya production)
const PADDLE_ENVIRONMENT = 'sandbox';

// Checkout URL
const PADDLE_CHECKOUT_BASE = 'https://sandbox-checkout.paddle.com';

// Price IDs (Paddle Dashboard'dan alınır)
const PRICE_ID_MONTHLY = 'pri_01k4d6txnqjgvvg4f0fhv5a409';
const PRICE_ID_YEARLY = 'pri_01k4d6w8820c61j8v9x1qtzjcz';
```

**Checkout URL Formatı:**
```
https://sandbox-checkout.paddle.com/checkout/custom/{priceId}?guest_email={email}
```

**Parametreler:**
- `priceId`: Paddle price ID (monthly veya yearly)
- `guest_email`: Kullanıcının email'i (form'da prefilled gelir)

### output.js

FREE kullanıcılar için 50 review limiti kontrolü yapılır.

**Limit Kontrolü:**
```javascript
const FREE_USER_REVIEW_LIMIT = 50;

if (!isProUser && allReviews.length >= FREE_USER_REVIEW_LIMIT) {
    // Show upgrade message
}
```

---

## 🔧 Backend Entegrasyonu

### PaddleWebhookController.java

Paddle'dan gelen webhook eventlerini işler.

**Endpoint:**
```
POST /api/paddle/webhook
```

**İşlenen Event'ler:**
- `subscription.created` - Yeni abonelik oluşturuldu
- `subscription.updated` - Abonelik güncellendi (plan değişikliği, ödeme)
- `subscription.canceled` - Abonelik iptal edildi
- `subscription.past_due` - Ödeme başarısız
- `subscription.paused` - Abonelik donduruldu
- `subscription.resumed` - Abonelik yeniden başlatıldı

**Event Payload Örneği:**
```json
{
  "event_type": "subscription.created",
  "data": {
    "id": "sub_01hv8x29kz0t586xy6zn1a62ny",
    "status": "active",
    "customer_id": "ctm_01hv6y1jedq4p1n0yqn5ba3ky4",
    "items": [
      {
        "price": {
          "id": "pri_01k4d6txnqjgvvg4f0fhv5a409"
        }
      }
    ]
  }
}
```

### PaddleService.java

Webhook eventlerini işler ve database'i günceller.

**İş Mantığı:**
1. Event type'a göre işlem yap
2. Customer email ile User'ı bul
3. Subscription bilgilerini kaydet/güncelle
4. Status'u güncelle (ACTIVE, CANCELED, etc.)

### Database Schema

**User Table:**
```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    paddle_customer_id VARCHAR(255)
);
```

**Subscription Table:**
```sql
CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id),
    paddle_subscription_id VARCHAR(255) UNIQUE,
    plan_id VARCHAR(255),
    status VARCHAR(50),
    current_period_end TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

---

## 🔗 Webhook Kurulumu

### 1. Paddle Dashboard'a Git

https://vendors.paddle.com/

### 2. Settings > Notification Settings

**Webhook URL'i ekle:**
```
https://api.laodikeia.co/api/paddle/webhook
```

### 3. Webhook Secret Ayarla

Backend'de environment variable olarak ayarla:
```bash
PADDLE_WEBHOOK_SECRET=your_webhook_secret_here
```

### 4. Event'leri Seç

Aşağıdaki event'leri aktif et:
- ✅ subscription.created
- ✅ subscription.updated
- ✅ subscription.canceled
- ✅ subscription.past_due
- ✅ subscription.paused
- ✅ subscription.resumed

### 5. Webhook İmza Doğrulama

Backend'de webhook imzasını doğrula (güvenlik için):
```java
public boolean verifyWebhookSignature(String signature, String body) {
    // Paddle signature verification
    // https://developer.paddle.com/webhooks/signature-verification
}
```

---

## 🚀 Production'a Geçiş

### 1. Paddle Dashboard Ayarları

**Sandbox'tan Production'a geç:**
1. Paddle Dashboard > Settings > Environments
2. Production environment'ı aktif et
3. Production API keys'i al

### 2. Frontend Değişiklikleri

**checkout.html:**
```javascript
// Değiştir:
const PADDLE_ENVIRONMENT = 'production';
const PADDLE_CHECKOUT_BASE = 'https://checkout.paddle.com';

// Production price ID'lerini al:
const PRICE_ID_MONTHLY = 'pri_prod_xxxxxxxxx';
const PRICE_ID_YEARLY = 'pri_prod_yyyyyyyyy';
```

### 3. Backend Değişiklikleri

**application.properties:**
```properties
# Paddle Production Settings
paddle.api.key=${PADDLE_API_KEY_PROD}
paddle.environment=production
paddle.webhook.secret=${PADDLE_WEBHOOK_SECRET_PROD}
```

**Environment Variables:**
```bash
PADDLE_API_KEY_PROD=your_production_api_key
PADDLE_WEBHOOK_SECRET_PROD=your_production_webhook_secret
```

### 4. Webhook URL Güncelle

Paddle Dashboard'da webhook URL'i production backend'e yönlendir:
```
https://api.laodikeia.co/api/paddle/webhook
```

### 5. Price ID'leri Oluştur

Paddle Dashboard > Catalog > Prices:
1. Monthly plan oluştur ($9.99/month)
2. Yearly plan oluştur ($99.99/year)
3. Price ID'lerini not al
4. Frontend ve backend'de güncelle

---

## 🧪 Test Senaryoları

### Test Case 1: Başarılı Abonelik

1. Extension'da "Upgrade to PRO" tıkla
2. checkout.html sayfası açılır
3. "Get Monthly Plan" tıkla
4. Paddle Checkout sayfası açılır
5. Test kartı ile ödeme yap:
   - Card: 4242 4242 4242 4242
   - Expiry: 12/25
   - CVC: 123
6. Ödeme tamamlanır
7. Paddle webhook backend'e bildirim gönderir
8. Backend subscription'ı kaydeder
9. Extension'da PRO badge görünür

### Test Case 2: FREE Kullanıcı Limiti

1. FREE user olarak login ol
2. Etsy listing sayfasında "Fetch Reviews" tıkla
3. 50 review çekildikten sonra dur
4. Upgrade mesajı gösterilir
5. "Upgrade to PRO" linkine tıkla
6. checkout.html açılır

### Test Case 3: Abonelik İptali

1. PRO user olarak login ol
2. Paddle Customer Portal'dan aboneliği iptal et
3. Paddle webhook backend'e bildirim gönderir
4. Backend status'u CANCELED yapar
5. Extension'da FREE badge görünür
6. 50 review limiti aktif olur

---

## 🔐 Güvenlik

### Webhook Doğrulama

**Her webhook isteğini doğrula:**
```java
@PostMapping("/webhook")
public ResponseEntity<Void> handleWebhook(
    @RequestHeader("Paddle-Signature") String signature,
    @RequestBody String rawBody
) {
    if (!paddleService.verifySignature(signature, rawBody)) {
        return ResponseEntity.status(401).build();
    }
    // Process webhook...
}
```

### API Key Güvenliği

**Environment variables kullan:**
- ❌ Hardcode API keys
- ✅ Use environment variables
- ✅ Use secrets management (AWS Secrets Manager, etc.)

---

## 📊 Monitoring & Logging

### Paddle Dashboard

**Metrics:**
- Active subscriptions
- MRR (Monthly Recurring Revenue)
- Churn rate
- Failed payments

### Backend Logs

**Önemli log'lar:**
```java
logger.info("Webhook received: {}", eventType);
logger.info("User subscription created: userId={}, planId={}", userId, planId);
logger.error("Failed to process webhook: {}", error.getMessage());
```

### Database Queries

**Subscription istatistikleri:**
```sql
-- Active subscriptions
SELECT COUNT(*) FROM subscriptions WHERE status = 'ACTIVE';

-- MRR calculation
SELECT SUM(price) FROM subscriptions 
WHERE status = 'ACTIVE' AND plan_type = 'monthly';
```

---

## 📞 Destek & Troubleshooting

### Yaygın Hatalar

**1. Webhook 401 Unauthorized**
- ✅ Webhook secret doğru mu kontrol et
- ✅ Signature verification çalışıyor mu kontrol et

**2. User Not Found**
- ✅ Email doğru mu kontrol et
- ✅ User database'de var mı kontrol et

**3. Subscription Not Updated**
- ✅ Webhook event'i doğru işleniyor mu kontrol et
- ✅ Database transaction başarılı mı kontrol et

### Paddle Support

- Documentation: https://developer.paddle.com/
- Support: support@paddle.com
- Community: https://www.paddle.com/community

---

## ✅ Checklist

### Production Launch Checklist

- [ ] Paddle Production account oluşturuldu
- [ ] Production price ID'leri oluşturuldu
- [ ] Frontend'de production URL ve price ID'leri güncellendi
- [ ] Backend'de production API keys ayarlandı
- [ ] Webhook URL production backend'e yönlendirildi
- [ ] Webhook signature verification aktif
- [ ] Test ödeme yapıldı ve başarılı
- [ ] Monitoring ve alerting ayarlandı
- [ ] Documentation güncellendi
- [ ] Customer support hazır

---

## 📝 Notlar

- Paddle Billing API v1 kullanılıyor
- Sandbox environment test için kullanılıyor
- Production'a geçmeden önce tüm test senaryolarını çalıştır
- Webhook secret'i güvenli tut
- API rate limiting'e dikkat et (Paddle: 1000 req/min)

---

**Son Güncelleme:** 2025-01-10
**Versiyon:** 1.0.0

