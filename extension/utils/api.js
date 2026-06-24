// API Configuration
const API = {
    get BASE_URL() {
        return API_CONFIG.BASE_URL;
    },

    // Helper method to get headers
    async getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (includeAuth) {
            const token = await StorageManager.getToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        return headers;
    },

    async loginWithGoogle(accessToken, googleUserInfo) {
        try {
            const response = await fetch(`${this.BASE_URL}/auth/google`, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: await this.getHeaders(false),
                body: JSON.stringify({
                    accessToken,
                    googleId: googleUserInfo.id,
                    email: googleUserInfo.email,
                    name: googleUserInfo.name,
                    pictureUrl: googleUserInfo.picture
                })
            });

            if (!response.ok) {
                let detail = `HTTP error! status: ${response.status}`;
                try {
                    const body = await response.json();
                    if (body.error) {
                        detail = body.error;
                    }
                } catch {
                    // ignore non-JSON error bodies
                }
                throw new Error(detail);
            }

            return await response.json();
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

    async getCurrentUser() {
        try {
            const response = await fetch(`${this.BASE_URL}/auth/me`, {
                method: 'GET',
                headers: await this.getHeaders(true)
            });

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('HTTP error! status: 401 - Unauthorized');
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Get user error:', error);
            throw error; // Re-throw error so popup can handle it
        }
    },

    // Subscription endpoints
    async getSubscription() {
        try {
            const response = await fetch(`${this.BASE_URL}/subscription/me`, {
                method: 'GET',
                headers: await this.getHeaders(true)
            });

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Get subscription error:', error);
            throw error;
        }
    },

    async createCheckoutSession(variantId) {
        try {
            const response = await fetch(`${this.BASE_URL}/lemonsqueezy/checkout`, {
                method: 'POST',
                headers: await this.getHeaders(true),
                body: JSON.stringify({ variantId })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Create checkout error:', error);
            throw error;
        }
    },

    async cancelSubscription() {
        try {
            const response = await fetch(`${this.BASE_URL}/subscription/cancel`, {
                method: 'POST',
                headers: await this.getHeaders(true)
            });

            if (!response.ok) {
                let detail = `HTTP error! status: ${response.status}`;
                try {
                    const body = await response.json();
                    if (body.error) {
                        detail = body.error;
                    }
                } catch {
                    // ignore non-JSON error bodies
                }
                throw new Error(detail);
            }

            return await response.json();
        } catch (error) {
            console.error('Cancel subscription error:', error);
            throw error;
        }
    },

    async reactivateSubscription() {
        try {
            const response = await fetch(`${this.BASE_URL}/subscription/reactivate`, {
                method: 'POST',
                headers: await this.getHeaders(true)
            });

            if (!response.ok) {
                let detail = `HTTP error! status: ${response.status}`;
                try {
                    const body = await response.json();
                    if (body.error) {
                        detail = body.error;
                    }
                } catch {
                    // ignore non-JSON error bodies
                }
                throw new Error(detail);
            }

            return await response.json();
        } catch (error) {
            console.error('Reactivate subscription error:', error);
            throw error;
        }
    },

    async upgradeSubscription(variantId) {
        try {
            const response = await fetch(`${this.BASE_URL}/subscription/upgrade`, {
                method: 'POST',
                headers: await this.getHeaders(true),
                body: JSON.stringify({ variantId })
            });

            if (!response.ok) {
                let detail = `HTTP error! status: ${response.status}`;
                try {
                    const body = await response.json();
                    if (body.error) {
                        detail = body.error;
                    }
                } catch {
                    // ignore non-JSON error bodies
                }
                throw new Error(detail);
            }

            return await response.json();
        } catch (error) {
            console.error('Upgrade subscription error:', error);
            throw error;
        }
    },

    hasProAccess(subscription) {
        return SubscriptionHelper.hasProAccess(subscription);
    },

    isPendingCancel(subscription) {
        return SubscriptionHelper.isPendingCancel(subscription);
    }
};

if (typeof globalThis !== 'undefined') {
    globalThis.API = API;
}

// Make API available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
