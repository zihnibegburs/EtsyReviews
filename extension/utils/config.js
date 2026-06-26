// Local geliştirme: true | Production / Chrome Web Store: false
const USE_LOCAL_API = false;

const API_CONFIG = {
    BASE_URL: USE_LOCAL_API
        ? 'http://localhost:8081/api'
        : 'https://api.etsyfetcher.shop/api',
    PADDLE_PRICE_ID_MONTHLY: '',
    PADDLE_PRICE_ID_YEARLY: '',
};

if (typeof globalThis !== 'undefined') {
    globalThis.API_CONFIG = API_CONFIG;
}

if (typeof console !== 'undefined') {
    console.log('[Etsy Extension] API:', API_CONFIG.BASE_URL);
}
