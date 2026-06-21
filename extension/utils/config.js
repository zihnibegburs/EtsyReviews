const API_CONFIG = {
    BASE_URL: 'https://etsy-backend-u3x2.onrender.com/api',
    // Fallback when /stripe/config is unavailable (price IDs are public Stripe identifiers)
    STRIPE_PRICE_ID_MONTHLY: 'price_1TjcgFIn3ZINtrYjHcWpQmjW',
    STRIPE_PRICE_ID_YEARLY: 'price_1TjcgtIn3ZINtrYjZDhyAkF0',
};

if (typeof globalThis !== 'undefined') {
    globalThis.API_CONFIG = API_CONFIG;
}
