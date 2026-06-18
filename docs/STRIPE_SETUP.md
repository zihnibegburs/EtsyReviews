# Stripe Kurulum Rehberi

Paddle kaldırıldı. Abonelik ödemeleri artık **Stripe Checkout** ile çalışır.

## Akış

```
Uzantı → POST /api/stripe/checkout → Stripe hosted checkout
       → ödeme tamamlanır
       → Stripe webhook → POST /api/stripe/webhook
       → DB'de subscription ACTIVE
       → Uzantı GET /api/subscription/me
```

---

## 1. Stripe hesabı

1. https://dashboard.stripe.com/register
2. **Test mode** açık kalsın (geliştirme için)

---

## 2. Ürün ve fiyat oluştur

1. **Product catalog** → **Add product**
2. Örnek: `Etsy Reviews PRO`
3. İki **recurring price** ekle:
   - Monthly: $8/month
   - Yearly: $70/year
4. Her price'ın ID'sini kopyala (`price_...`)

---

## 3. API anahtarları

**Developers** → **API keys**:

| Key | Nereye |
|-----|--------|
| Publishable key `pk_test_...` | `application-local.properties` → `stripe.publishable-key` |
| Secret key `sk_test_...` | `application-local.properties` → `stripe.secret-key` |

---

## 4. Backend ayarları

`backend/src/main/resources/application-local.properties`:

```properties
stripe.secret-key=sk_test_...
stripe.publishable-key=pk_test_...
stripe.webhook-secret=whsec_...
stripe.price-id-monthly=price_...
stripe.price-id-yearly=price_...
stripe.success-url=http://localhost:8081/checkout/success?session_id={CHECKOUT_SESSION_ID}
stripe.cancel-url=http://localhost:8081/checkout/cancel
```

---

## 5. Webhook kurulumu

Ödeme sonrası PRO'nun aktif olması için webhook **şart**. İki yol var:

### Seçenek A — Stripe Dashboard (önerilen, CLI gerekmez)

Local'de `localhost:8081` Stripe'dan erişilemez. **ngrok** ile geçici public URL açarsın:

```bash
# ngrok kurulu değilse: https://ngrok.com/download
ngrok http 8081
```

Çıkan URL örneği: `https://abc123.ngrok-free.app`

**Stripe Dashboard** → **Developers** → **Webhooks** → **Add endpoint**:

| Alan | Değer |
|------|--------|
| Endpoint URL | `https://abc123.ngrok-free.app/api/stripe/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |

**Add endpoint** → **Signing secret** (`whsec_...`) → kopyala → `application-local.properties`:

```properties
stripe.webhook-secret=whsec_...
```

> ngrok her açılışta farklı URL verebilir → URL değişince Dashboard'daki endpoint'i güncelle.

**Production'da** ngrok yerine gerçek domain kullanırsın:
`https://api.senindomain.com/api/stripe/webhook`

---

### Seçenek B — Stripe CLI (Dashboard'a kayıt gerekmez)

CLI local'i Stripe'a bağlar; geçici `whsec_...` verir. **Dashboard'a endpoint eklemen gerekmez.**

#### Mac ARM — brew çalışmıyorsa (Rosetta sorunu)

GitHub'dan doğrudan indir:

```bash
cd ~/Downloads
curl -L -o stripe.tar.gz https://github.com/stripe/stripe-cli/releases/latest/download/stripe_mac-os_arm64.tar.gz
tar -xzf stripe.tar.gz
sudo mv stripe /usr/local/bin/stripe
stripe version
```

Sonra:

```bash
stripe login
stripe listen --forward-to localhost:8081/api/stripe/webhook
```

Terminalde görünen `whsec_...` → `stripe.webhook-secret`

---

### CLI vs Dashboard — fark ne?

| | Stripe CLI `listen` | Stripe Dashboard webhook |
|--|---------------------|--------------------------|
| Dashboard kaydı | Gerekmez | **Gerekir** |
| `whsec_` nereden | CLI terminal çıktısı | Dashboard → endpoint → Signing secret |
| Local test | Kolay | ngrok gerekir |
| Production | Kullanılmaz | **Bunu kullanırsın** |

---

Dinlenecek eventler:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

---

## Veritabanı tabloları

Backend otomatik oluşturur (`ddl-auto=update`):

| Tablo | Ne kaydeder |
|-------|-------------|
| `stripe_events` | Gelen tüm webhook eventleri (ham JSON + hata mesajı) |
| `stripe_payments` | Tamamlanan checkout ödemeleri |
| `subscriptions` | Aktif PRO abonelik durumu |

Debug API (JWT gerekli):
- `GET /api/stripe/events` — son 50 event
- `GET /api/stripe/payments` — son 50 ödeme

---

## 6. Test et

```bash
./scripts/start-backend.sh
```

1. Uzantıda Google ile giriş yap
2. PRO → checkout sayfası
3. Plan seç → Stripe test kartı:

| Alan | Değer |
|------|--------|
| Kart | `4242 4242 4242 4242` |
| Tarih | gelecekte herhangi |
| CVC | herhangi 3 hane |

4. Ödeme sonrası webhook gelir → PRO aktif olur

---

## 7. Production

1. Stripe Dashboard → **Live mode**
2. Live API keys ve live `price_...` ID'leri
3. Webhook URL: `https://api.senindomain.com/api/stripe/webhook`
4. `stripe.success-url` / `cancel-url` production domain'e güncelle

---

## API uçları

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/stripe/config` | Price ID'ler (JWT gerekli) |
| `POST /api/stripe/checkout` | Checkout URL oluştur |
| `POST /api/stripe/webhook` | Stripe eventleri |
| `GET /api/subscription/me` | Abonelik durumu |
