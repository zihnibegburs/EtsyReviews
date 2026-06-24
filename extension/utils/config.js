// Local geliştirme: true | Production / Chrome Web Store: false
const USE_LOCAL_API = true;

const API_CONFIG = {
    BASE_URL: USE_LOCAL_API
        ? 'http://localhost:8081/api'
        : 'https://etsy-backend-u3x2.onrender.com/api',
    LEMONSQUEEZY_VARIANT_ID_MONTHLY: '',
    LEMONSQUEEZY_VARIANT_ID_YEARLY: '',
};

if (typeof globalThis !== 'undefined') {
    globalThis.API_CONFIG = API_CONFIG;
}

if (typeof console !== 'undefined') {
    console.log('[Etsy Extension] API:', API_CONFIG.BASE_URL);
}
