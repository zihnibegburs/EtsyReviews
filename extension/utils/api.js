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

    async loginWithGoogleCode(code, redirectUri) {
        try {
            const response = await fetch(`${this.BASE_URL}/auth/google/code`, {
                method: 'POST',
                headers: await this.getHeaders(false),
                body: JSON.stringify({ code, redirectUri })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

    // Auth endpoints - Updated to match backend format
    async loginWithGoogle(googleUserInfo) {
        try {
            const response = await fetch(`${this.BASE_URL}/auth/google`, {
                method: 'POST',
                headers: await this.getHeaders(false),
                body: JSON.stringify({
                    googleId: googleUserInfo.id,
                    email: googleUserInfo.email,
                    name: googleUserInfo.name,
                    pictureUrl: googleUserInfo.picture
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
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

    async createCheckoutSession(priceId) {
        try {
            const response = await fetch(`${this.BASE_URL}/stripe/checkout`, {
                method: 'POST',
                headers: await this.getHeaders(true),
                body: JSON.stringify({ priceId })
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
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Cancel subscription error:', error);
            throw error;
        }
    }
};

// Make API available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
}
