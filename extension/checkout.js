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

function showCheckoutError(message) {
    const errorEl = document.getElementById('checkoutError');
    if (!errorEl) {
        alert(message);
        return;
    }

    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearCheckoutError() {
    const errorEl = document.getElementById('checkoutError');
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
}

function getLocalStripeConfig() {
    if (API_CONFIG.STRIPE_PRICE_ID_MONTHLY && API_CONFIG.STRIPE_PRICE_ID_YEARLY) {
        return {
            priceIdMonthly: API_CONFIG.STRIPE_PRICE_ID_MONTHLY,
            priceIdYearly: API_CONFIG.STRIPE_PRICE_ID_YEARLY
        };
    }
    return null;
}

async function fetchStripeConfigFromApi() {
    const token = await StorageManager.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await fetch(`${API_CONFIG.BASE_URL}/stripe/config`, { headers });
    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    if (!data?.priceIdMonthly || !data?.priceIdYearly) {
        return null;
    }

    return data;
}

async function loadStripeConfig() {
    if (stripeConfig) return stripeConfig;

    try {
        const remoteConfig = await fetchStripeConfigFromApi();
        if (remoteConfig) {
            stripeConfig = remoteConfig;
            return stripeConfig;
        }
    } catch (error) {
        console.warn('Stripe config API unavailable:', error.message);
    }

    const localConfig = getLocalStripeConfig();
    if (localConfig) {
        stripeConfig = localConfig;
        return stripeConfig;
    }

    throw new Error('Failed to load Stripe config. Please try again later.');
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
            const hasActive = SubscriptionHelper.hasProAccess(subscription);
            const isPendingCancel = SubscriptionHelper.isPendingCancel(subscription);
            const renewsAt = subscription.currentPeriodEnd
                ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                : null;

            if (hasActive) {
                if (isPendingCancel) {
                    statusEl.textContent = renewsAt
                        ? `✓ PRO (ends ${renewsAt})`
                        : '✓ PRO (cancelling)';
                } else {
                    statusEl.textContent = renewsAt
                        ? `✓ PRO (renews ${renewsAt})`
                        : '✓ PRO';
                }
                statusEl.style.color = '#27ae60';

                const config = await loadStripeConfig();
                const isMonthly = subscription.planId === config.priceIdMonthly;
                const isYearly = subscription.planId === config.priceIdYearly;

                if (isYearly || isPendingCancel) {
                    setCheckoutButtonsDisabled(true, 'You already have PRO');
                    delete yearlyBtn.dataset.action;
                } else if (isMonthly) {
                    monthlyBtn.disabled = true;
                    monthlyBtn.textContent = 'Current Plan';
                    yearlyBtn.disabled = false;
                    yearlyBtn.textContent = 'Upgrade to Yearly';
                    yearlyBtn.dataset.action = 'upgrade';
                } else {
                    setCheckoutButtonsDisabled(true, 'You already have PRO');
                    delete yearlyBtn.dataset.action;
                }

                return subscription;
            }
        }

        statusEl.textContent = 'FREE';
        statusEl.style.color = '#e67e22';
        setCheckoutButtonsDisabled(false);
        delete monthlyBtn.dataset.action;
        delete yearlyBtn.dataset.action;
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
    loadingDiv.classList.remove('hidden');
    clearCheckoutError();

    try {
        const token = await StorageManager.getToken();
        if (!token) {
            throw new Error('Please login in the extension first, then try again.');
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
            throw new Error(data.error || 'You already have an active subscription.');
        }
        if (!response.ok) {
            throw new Error(data.error || `Checkout failed (HTTP ${response.status})`);
        }
        if (!data.checkoutUrl) {
            throw new Error('Checkout URL missing from server response');
        }

        chrome.tabs.create({ url: data.checkoutUrl });
    } finally {
        loadingDiv.classList.add('hidden');
    }
}

async function upgradeSubscription(priceId) {
    const token = await StorageManager.getToken();
    if (!token) {
        throw new Error('Please login in the extension first, then try again.');
    }

    const response = await fetch(`${API_CONFIG.BASE_URL}/subscription/upgrade`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ priceId })
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || `Upgrade failed (HTTP ${response.status})`);
    }

    return data;
}

async function startCheckout(plan) {
    const monthlyBtn = document.getElementById('monthlyBtn');
    const yearlyBtn = document.getElementById('yearlyBtn');
    const activeBtn = plan === 'yearly' ? yearlyBtn : monthlyBtn;

    if (activeBtn.disabled) {
        return;
    }

    const originalLabel = activeBtn.textContent;
    clearCheckoutError();
    monthlyBtn.disabled = true;
    yearlyBtn.disabled = true;
    activeBtn.textContent = plan === 'yearly' && activeBtn.dataset.action === 'upgrade'
        ? 'Upgrading...'
        : 'Opening checkout...';

    try {
        const config = await loadStripeConfig();
        const priceId = plan === 'yearly' ? config.priceIdYearly : config.priceIdMonthly;

        if (plan === 'yearly' && activeBtn.dataset.action === 'upgrade') {
            const confirmed = confirm(
                'Upgrade to the yearly plan?\n\nStripe will apply prorated credit from your current monthly plan.'
            );
            if (!confirmed) {
                return;
            }
            await upgradeSubscription(priceId);
            await loadStatus();
            alert('Upgraded to yearly plan successfully.');
            return;
        }

        await openStripeCheckout(priceId);
    } catch (error) {
        console.error('Checkout error:', error);
        showCheckoutError(error.message || 'Failed to open checkout');
    } finally {
        if (activeBtn.textContent === 'Opening checkout...' || activeBtn.textContent === 'Upgrading...') {
            activeBtn.textContent = originalLabel;
        }
        await loadStatus();
    }
}

function setupCheckoutButtons() {
    document.getElementById('monthlyBtn').addEventListener('click', () => {
        startCheckout('monthly');
    });
    document.getElementById('yearlyBtn').addEventListener('click', () => {
        startCheckout('yearly');
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setupCheckoutButtons();
    await loadStatus();

    try {
        await loadStripeConfig();
        clearCheckoutError();
    } catch (error) {
        console.warn('Stripe config preload failed:', error.message);
        showCheckoutError('Could not load billing config. Click a plan to retry.');
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
