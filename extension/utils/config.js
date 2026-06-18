// Shared API base URL — unpacked extension → localhost, packaged/CRX → production
const API_CONFIG = {
    LOCAL_BASE_URL: 'http://localhost:8081/api',
    PRODUCTION_BASE_URL: 'https://api.laodikeia.co/api',
    // Web application OAuth client (Google Cloud Console → Web client)
    GOOGLE_WEB_CLIENT_ID: '392877515606-htg137mvle8mbldbqj21ch2bkt7ov4qq.apps.googleusercontent.com',

    isDevelopment() {
        try {
            return !chrome.runtime.getManifest().update_url;
        } catch {
            return false;
        }
    },

    get BASE_URL() {
        return this.isDevelopment() ? this.LOCAL_BASE_URL : this.PRODUCTION_BASE_URL;
    },

    getGoogleRedirectUri() {
        return chrome.identity.getRedirectURL();
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.API_CONFIG = API_CONFIG;
}
