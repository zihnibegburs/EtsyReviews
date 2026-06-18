# Etsy Reviews

Etsy listing yorumlarını toplayan Chrome uzantısı ve abonelik yönetimi için monorepo.

## GitHub'a yükleme

```bash
# 1. Repoyu klonla (veya bu klasörde çalışıyorsan atla)
git clone https://github.com/KULLANICI_ADIN/EtsyReviews.git
cd EtsyReviews

# 2. Ortam dosyalarını oluştur
cp .env.example .env
cp backend/.env.example backend/.env
cp backend/src/main/resources/application-local.properties.example \
   backend/src/main/resources/application-local.properties
cp web/auth/.env.example web/auth/.env.local
cp web/checkout/.env.example web/checkout/.env.local

# 3. application-local.properties ve .env dosyalarına gerçek anahtarlarını yaz
```

> **Güvenlik:** `application-local.properties`, `.env` ve benzeri dosyalar `.gitignore` içindedir — asla commit etmeyin.

## İlk kurulum (geliştirici)

## Yapı

```
EtsyReviews/
├── backend/          # Spring Boot API (auth, abonelik, Paddle)
├── extension/        # Chrome MV3 uzantısı (ana ürün)
├── web/
│   ├── auth/         # Next.js OAuth backend (eski / referans)
│   └── checkout/     # Next.js Paddle checkout (eski / referans)
├── legacy/
│   └── extension/    # İlk nesil uzantı (referans)
├── docs/             # Paddle ve webhook dokümantasyonu
└── scripts/          # Yardımcı scriptler
```

## Hızlı Başlangıç

### 1. API (Spring Boot) — önerilen

```bash
# PostgreSQL (Docker)
docker compose up postgres -d

# API'yi çalıştır (application-local.properties otomatik yüklenir)
chmod +x scripts/start-backend.sh
./scripts/start-backend.sh
```

Uzantı, paketlenmemiş yüklendiğinde otomatik olarak `http://localhost:8081/api` kullanır.

API: `http://localhost:8081`  
Swagger: `http://localhost:8081/swagger-ui.html`

Tüm stack (Postgres + API):

```bash
docker compose up --build
```

### 2. Chrome Uzantısı

1. Chrome'da `chrome://extensions` açın
2. Geliştirici modunu etkinleştirin
3. **Paketlenmemiş öğe yükle** → `extension/` klasörünü seçin
4. Bir Etsy listing sayfasına gidin ve uzantıyı kullanın

### 3. Web uygulamaları (isteğe bağlı / legacy)

**Auth (port 3000):**

```bash
cd web/auth
cp .env.example .env.local
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

**Checkout (port 3001 — port çakışmasını önlemek için):**

```bash
cd web/checkout
cp .env.example .env.local
npm install
npm run dev -- -p 3001
```

## Teknolojiler

| Bileşen | Stack |
|---------|-------|
| `backend/` | Java 21, Spring Boot, PostgreSQL, JWT, Stripe |
| `extension/` | Chrome MV3, vanilla JS |
| `web/auth/` | Next.js 15, Prisma, Google OAuth |
| `web/checkout/` | Next.js 15, Paddle.js |

## Dokümantasyon

- `docs/GOOGLE_OAUTH.md` — Google OAuth production kurulumu
- `docs/STRIPE_SETUP.md` — Stripe abonelik kurulumu

## Kaynak Projeler

| Eski repo | Yeni konum |
|-----------|------------|
| `EtsyBackend/` | `backend/` + `extension/` |
| `Etsy/backend/` | `web/auth/` |
| `Etsy/etsy-backend/` | `web/checkout/` |
| `Etsy/extension/` | `legacy/extension/` |
