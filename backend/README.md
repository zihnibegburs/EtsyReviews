# API Backend

Spring Boot REST API: Google OAuth, JWT, abonelik ve Paddle entegrasyonu.

## Geliştirme

```bash
./gradlew bootRun --args='--spring.profiles.active=local'
```

Local ayarlar `src/main/resources/application-local.properties` dosyasındadır.

Veya repo kökünden: `../scripts/start-backend.sh`

## Docker

```bash
docker build -t etsy-reviews-api .
docker run -p 8081:8081 --env-file .env etsy-reviews-api
```

Varsayılan port: `8081`
