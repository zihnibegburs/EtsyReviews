// Local geliştirme: true | Production / Chrome Web Store: false
const USE_LOCAL_API = false;

const API_CONFIG = {
    BASE_URL: USE_LOCAL_API
        ? 'http://localhost:8081/api'
        : 'https://api.etsyfetcher.shop/api',
    SITE_URL: USE_LOCAL_API
        ? 'http://localhost:8081'
        : 'https://api.etsyfetcher.shop',
    PADDLE_PRICE_ID_MONTHLY: 'pri_01kw1w2z9c9k9439mx4z56gn4j',
    PADDLE_PRICE_ID_YEARLY: 'pri_01kw1w48nggzm5r653vgy09ggd',
};

if (typeof globalThis !== 'undefined') {
    globalThis.API_CONFIG = API_CONFIG;
}

if (typeof console !== 'undefined') {
    console.log('[Etsy Extension] API:', API_CONFIG.BASE_URL);
}
