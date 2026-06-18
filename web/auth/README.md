# Auth Web (Legacy)

Next.js tabanlı Google OAuth ve kullanıcı oturumu. Ana ürün için `../../backend/` (Spring Boot) kullanılır; bu uygulama referans amaçlıdır.

```bash
cp .env.example .env.local
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Varsayılan port: `3000`
