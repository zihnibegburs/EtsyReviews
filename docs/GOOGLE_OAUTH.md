# Google OAuth — Production Kurulumu

Bu proje **Chrome uzantısı** ile giriş yapar. Klasik web OAuth callback (`/api/auth/callback/google`) **kullanılmaz**.

## Nasıl çalışır?

1. Uzantı `chrome.identity.getAuthToken()` ile Google'dan access token alır
2. Token backend'e gönderilir (`POST /api/auth/google`)
3. Backend token'ı Google'da doğrular, kullanıcıyı oluşturur/günceller, JWT döner

## Google Cloud Console

### 1. OAuth consent screen

- https://console.cloud.google.com/apis/credentials/consent
- Test modunda kullanıcılarınızı **Test users** listesine ekleyin

### 2. Chrome Extension OAuth client (zorunlu)

1. https://console.cloud.google.com/apis/credentials
2. **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Chrome Extension** (Web application değil)
4. Item ID (Extension ID):

```
bbohnnkggbeefhnngkomofalpfhomiel
```

5. Oluşan **Client ID**'yi şuralara yazın:
   - `extension/manifest.json` → `oauth2.client_id`
   - Render → `GOOGLE_CLIENT_ID` environment variable

> Extension ID, `manifest.json` içindeki `key` alanı sayesinde sabittir. `chrome://extensions` altında doğrulayın.

### 3. Web application client (isteğe bağlı)

`web/auth/` (Next.js) kullanacaksanız ayrı bir **Web application** client oluşturun. Uzantı login'i bunu **kullanmaz**.

## Render environment variables

Backend için gerekli:

| Variable | Değer |
|----------|-------|
| `GOOGLE_CLIENT_ID` | Chrome Extension client ID (`manifest.json` ile aynı) |

Gerekli **değil**:

- `GOOGLE_CLIENT_SECRET` — uzantı akışında backend secret kullanmaz
- `GOOGLE_REDIRECT_URI` — callback endpoint yok

Örnek:

```
GOOGLE_CLIENT_ID=392877515606-xxxxxxxx.apps.googleusercontent.com
```

## Local geliştirme

`backend/src/main/resources/application-local.properties`:

```properties
google.oauth2.client-id=YOUR_CHROME_EXTENSION_CLIENT_ID
```

Veya `backend/.env`:

```
GOOGLE_CLIENT_ID=YOUR_CHROME_EXTENSION_CLIENT_ID
```

## Sık yapılan hatalar

| Hata | Çözüm |
|------|-------|
| `redirect_uri_mismatch` | Web client redirect URI eklemeye çalışıyorsunuz; uzantı için Chrome Extension client kullanın |
| `Token was not issued for this application` | Render'daki `GOOGLE_CLIENT_ID`, `manifest.json` oauth2.client_id ile aynı değil |
| `Access blocked: app has not completed verification` | OAuth consent screen'de test kullanıcısı ekleyin veya uygulamayı yayınlayın |

## İlgili dosyalar

- `extension/manifest.json` — Chrome Extension OAuth client ID
- `extension/popup/popup.js` — login akışı
- `backend/.../GoogleOAuthService.java` — token doğrulama
- `extension/README.md` — detaylı uzantı kurulumu
