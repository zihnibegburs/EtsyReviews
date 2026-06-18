// Storage Manager using Chrome Storage API
const StorageManager = {
    // Keys
    KEYS: {
        TOKEN: 'auth_token',
        USER: 'user_data',
        SUBSCRIPTION: 'subscription_data',
        LAST_SYNC: 'last_sync'
    },

    // Set token
    async setToken(token) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [this.KEYS.TOKEN]: token }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    },

    // Get token
    async getToken() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([this.KEYS.TOKEN], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[this.KEYS.TOKEN] || null);
                }
            });
        });
    },

    // Set user data
    async setUser(user) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [this.KEYS.USER]: user }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    },

    // Get user data
    async getUser() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([this.KEYS.USER], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[this.KEYS.USER] || null);
                }
            });
        });
    },

    // Set subscription data
    async setSubscription(subscription) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                [this.KEYS.SUBSCRIPTION]: subscription,
                [this.KEYS.LAST_SYNC]: Date.now()
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    },

    // Get subscription data
    async getSubscription() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([this.KEYS.SUBSCRIPTION], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[this.KEYS.SUBSCRIPTION] || null);
                }
            });
        });
    },

    // Get last sync time
    async getLastSync() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([this.KEYS.LAST_SYNC], (result) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(result[this.KEYS.LAST_SYNC] || 0);
                }
            });
        });
    },

    // Check if sync is needed (more than 5 minutes old)
    async needsSync() {
        const lastSync = await this.getLastSync();
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;
        return (now - lastSync) > fiveMinutes;
    },

    // Clear all data
    async clear() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.clear(() => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    },

    // Delay Configuration
    async getDelayConfig() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['fetchDelayMin', 'fetchDelayMax'], (result) => {
                resolve({
                    min: result.fetchDelayMin || 1,
                    max: result.fetchDelayMax || 3
                });
            });
        });
    },

    async setDelayConfig(min, max) {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({
                fetchDelayMin: min,
                fetchDelayMax: max
            }, () => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve();
                }
            });
        });
    }
};

// Make StorageManager available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
}
