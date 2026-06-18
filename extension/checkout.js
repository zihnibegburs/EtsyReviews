const StorageManager = {
    KEYS: { TOKEN: 'auth_token', USER: 'user_data' },

    async getToken() {
        return new Promise((resolve, reject) => {
            chrome.storage.local.get([this.KEYS.TOKEN], (result) => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve(result[this.KEYS.TOKEN] || null);
            });
        });
    }
};

let stripeConfig = null;

async function loadStripeConfig() {
    if (stripeConfig) return stripeConfig;

    const token = await StorageManager.getToken();
    if (!token) throw new Error('Please login first');

    const response = await fetch(`${API_CONFIG.BASE_URL}/stripe/config`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
        throw new Error('Failed to load Stripe config');
    }

    stripeConfig = await response.json();
    return stripeConfig;
}

async function loadStatus() {
    try {
        const token = await StorageManager.getToken();
        if (!token) {
            document.getElementById('currentStatus').textContent = 'Not logged in';
            return null;
        }

        const response = await fetch(`${API_CONFIG.BASE_URL}/subscription/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const statusEl = document.getElementById('currentStatus');
        const monthlyBtn = document.getElementById('monthlyBtn');
        const yearlyBtn = document.getElementById('yearlyBtn');

        if (response.ok) {
            const subscription = await response.json();
            if (subscription?.status === 'ACTIVE') {
                const renewsAt = subscription.currentPeriodEnd
                    ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                    : null;
                statusEl.textContent = renewsAt ? `✓ PRO (renews ${renewsAt})` : '✓ PRO';
                statusEl.style.color = '#27ae60';
                setCheckoutButtonsDisabled(true, 'You already have PRO');
                return subscription;
            }
        }

        statusEl.textContent = 'FREE';
        statusEl.style.color = '#e67e22';
        setCheckoutButtonsDisabled(false);
        return null;
    } catch (error) {
        console.error('Error loading status:', error);
        return null;
    }
}

function setCheckoutButtonsDisabled(disabled, label = null) {
    const monthlyBtn = document.getElementById('monthlyBtn');
    const yearlyBtn = document.getElementById('yearlyBtn');

    monthlyBtn.disabled = disabled;
    yearlyBtn.disabled = disabled;

    if (disabled && label) {
        monthlyBtn.textContent = label;
        yearlyBtn.textContent = label;
    } else {
        monthlyBtn.textContent = 'Get Monthly Plan';
        yearlyBtn.textContent = 'Get Yearly Plan';
    }
}

async function openStripeCheckout(priceId) {
    const loadingDiv = document.getElementById('loadingMessage');
    loadingDiv.style.display = 'block';

    try {
        const token = await StorageManager.getToken();
        if (!token) {
            alert('Please login first to continue with checkout.');
            return;
        }

        const response = await fetch(`${API_CONFIG.BASE_URL}/stripe/checkout`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ priceId })
        });

        const data = await response.json();
        if (response.status === 409) {
            alert(data.error || 'You already have an active subscription.');
            await loadStatus();
            return;
        }
        if (!response.ok) {
            throw new Error(data.error || 'Checkout failed');
        }

        chrome.tabs.create({ url: data.checkoutUrl });
    } catch (error) {
        console.error('Checkout error:', error);
        alert('Failed to open checkout: ' + error.message);
    } finally {
        loadingDiv.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadStatus();

    try {
        const config = await loadStripeConfig();
        document.getElementById('monthlyBtn').addEventListener('click', () => {
            openStripeCheckout(config.priceIdMonthly);
        });
        document.getElementById('yearlyBtn').addEventListener('click', () => {
            openStripeCheckout(config.priceIdYearly);
        });
    } catch (error) {
        console.warn('Stripe config not loaded:', error.message);
    }

    document.getElementById('backLink').addEventListener('click', (e) => {
        e.preventDefault();
        window.close();
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
        document.getElementById('currentStatus').textContent = '✓ PRO (activating...)';
    }
});
