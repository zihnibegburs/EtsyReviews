# Chrome Extension

Etsy listing sayfalarından yorum toplama, CSV export ve PRO abonelik yönetimi.

## Kurulum

1. `chrome://extensions` → Geliştirici modu
2. **Paketlenmemiş öğe yükle** → bu klasörü seçin
3. API'nin çalıştığından emin olun (`../../backend/` veya production URL)

## Google OAuth — Chrome Extension client (zorunlu)

Uzantı login **Web client** kullanmaz. Ayrı bir **Chrome Extension** OAuth client gerekir.

### Extension ID

`manifest.json` içindeki `key` sayesinde sabit ID:

```
bbohnnkggbeefhnngkomofalpfhomiel
```

`chrome://extensions` altında aynı ID'yi doğrula.

### Google Cloud Console

1. https://console.cloud.google.com/apis/credentials
2. **+ CREATE CREDENTIALS** → **OAuth client ID**
3. Application type: **Chrome Extension** (Web application değil!)
4. **Item ID** / Extension ID:

```
bbohnnkggbeefhnngkomofalpfhomiel
```

5. Create → çıkan **Client ID**'yi kopyala
6. `manifest.json` → `oauth2.client_id` alanına yapıştır
7. Uzantıyı yenile

### OAuth consent screen

- **Test users** listesine `ZihniBegburs@gmail.com` ekle
- App **Testing** modunda olabilir; production gerekmez

### İki client olması normal

| Client tipi | Ne için |
|-------------|---------|
| **Chrome Extension** | Uzantı Sign in with Google |
| **Web application** | İleride web/auth (Next.js) |

Web client (`392877515606-...`) uzantı login için kullanılmaz.

## Yapı

```
extension/
├── manifest.json       # oauth2.client_id burada
├── background/
├── content/
├── popup/
├── utils/
├── checkout.html/js
└── output.html/js
```
