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

let billingConfig = null;

function getSiteUrl() {
    return (API_CONFIG.SITE_URL || 'https://api.etsyfetcher.shop').replace(/\/$/, '');
}

function setupPolicyLinks() {
    const siteUrl = getSiteUrl();
    const termsLink = document.getElementById('termsLink');
    const privacyLink = document.getElementById('privacyLink');
    const refundLink = document.getElementById('refundLink');

    if (termsLink) termsLink.href = `${siteUrl}/terms`;
    if (privacyLink) privacyLink.href = `${siteUrl}/privacy`;
    if (refundLink) refundLink.href = `${siteUrl}/refund`;

    [termsLink, privacyLink, refundLink].forEach((link) => {
        link?.addEventListener('click', (event) => event.stopPropagation());
    });
}

function isTermsAccepted() {
    const checkbox = document.getElementById('acceptTerms');
    return Boolean(checkbox?.checked);
}

function planRequiresTerms(plan) {
    const yearlyBtn = document.getElementById('yearlyBtn');
    return !(plan === 'yearly' && yearlyBtn?.dataset.action === 'upgrade');
}

function refreshCheckoutButtons() {
    const monthlyBtn = document.getElementById('monthlyBtn');
    const yearlyBtn = document.getElementById('yearlyBtn');
    const termsSection = document.getElementById('termsAcceptance');
    const accepted = isTermsAccepted();

    const monthlyLocked = monthlyBtn.dataset.locked === 'true';
    const yearlyLocked = yearlyBtn.dataset.locked === 'true';
    const yearlyUpgrade = yearlyBtn.dataset.action === 'upgrade';
    const showTerms = !monthlyLocked || (!yearlyLocked && !yearlyUpgrade);

    if (termsSection) {
        termsSection.classList.toggle('hidden', !showTerms);
    }

    monthlyBtn.disabled = monthlyLocked || !accepted;
    yearlyBtn.disabled = yearlyLocked || (!yearlyUpgrade && !accepted);
}

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

function getLocalBillingConfig() {
    if (API_CONFIG.PADDLE_PRICE_ID_MONTHLY && API_CONFIG.PADDLE_PRICE_ID_YEARLY) {
        return {
            priceIdMonthly: API_CONFIG.PADDLE_PRICE_ID_MONTHLY,
            priceIdYearly: API_CONFIG.PADDLE_PRICE_ID_YEARLY
        };
    }
    return null;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(
                `Backend did not respond in time. Is it running at ${API_CONFIG.BASE_URL}?`
            );
        }
        throw new Error(`Could not reach backend at ${API_CONFIG.BASE_URL}`);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchBillingConfigFromApi() {
    const token = await StorageManager.getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const response = await fetchWithTimeout(`${API_CONFIG.BASE_URL}/paddle/config`, { headers });
    if (!response.ok) {
        return null;
    }

    const data = await response.json();
    if (!data?.priceIdMonthly || !data?.priceIdYearly) {
        return null;
    }

    return data;
}

async function loadBillingConfig() {
    if (billingConfig) return billingConfig;

    try {
        const remoteConfig = await fetchBillingConfigFromApi();
        if (remoteConfig) {
            billingConfig = remoteConfig;
            return billingConfig;
        }
    } catch (error) {
        console.warn('Billing config API unavailable:', error.message);
    }

    const localConfig = getLocalBillingConfig();
    if (localConfig) {
        billingConfig = localConfig;
        return billingConfig;
    }

    throw new Error('Failed to load billing config. Please try again later.');
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

                const config = await loadBillingConfig();
                const isMonthly = subscription.planId === config.priceIdMonthly;
                const isYearly = subscription.planId === config.priceIdYearly;

                if (isYearly || isPendingCancel) {
                    setCheckoutButtonsDisabled(true, 'You already have PRO');
                    delete yearlyBtn.dataset.action;
                } else if (isMonthly) {
                    monthlyBtn.dataset.locked = 'true';
                    monthlyBtn.textContent = 'Current Plan';
                    yearlyBtn.dataset.locked = 'false';
                    yearlyBtn.textContent = 'Upgrade to Yearly';
                    yearlyBtn.dataset.action = 'upgrade';
                    refreshCheckoutButtons();
                } else {
                    setCheckoutButtonsDisabled(true, 'You already have PRO');
                    delete yearlyBtn.dataset.action;
                }

                return subscription;
            }
        }

        statusEl.textContent = 'FREE';
        statusEl.style.color = '#e67e22';
        monthlyBtn.dataset.locked = 'false';
        yearlyBtn.dataset.locked = 'false';
        delete monthlyBtn.dataset.action;
        delete yearlyBtn.dataset.action;
        refreshCheckoutButtons();
        return null;
    } catch (error) {
        console.error('Error loading status:', error);
        return null;
    }
}

function setCheckoutButtonsDisabled(disabled, label = null) {
    const monthlyBtn = document.getElementById('monthlyBtn');
    const yearlyBtn = document.getElementById('yearlyBtn');

    monthlyBtn.dataset.locked = disabled ? 'true' : 'false';
    yearlyBtn.dataset.locked = disabled ? 'true' : 'false';

    if (disabled && label) {
        monthlyBtn.textContent = label;
        yearlyBtn.textContent = label;
    } else {
        monthlyBtn.textContent = 'Get Monthly Plan';
        yearlyBtn.textContent = 'Get Yearly Plan';
    }

    refreshCheckoutButtons();
}

async function openCheckout(priceId) {
    const loadingDiv = document.getElementById('loadingMessage');
    loadingDiv.classList.remove('hidden');
    clearCheckoutError();

    try {
        const token = await StorageManager.getToken();
        if (!token) {
            throw new Error('Please login in the extension first, then try again.');
        }

        const response = await fetchWithTimeout(`${API_CONFIG.BASE_URL}/paddle/checkout`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ priceId, acceptedTerms: true })
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Checkout failed (HTTP ${response.status})`);
        }
        if (response.status === 401 || response.status === 403) {
            throw new Error('Session expired. Log out and sign in again from the extension popup.');
        }
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

    if (planRequiresTerms(plan) && !isTermsAccepted()) {
        showCheckoutError('Please accept the Terms of Service, Privacy Policy, and Refund Policy to continue.');
        document.getElementById('acceptTerms')?.focus();
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
        const config = await loadBillingConfig();
        const priceId = plan === 'yearly' ? config.priceIdYearly : config.priceIdMonthly;

        if (plan === 'yearly' && activeBtn.dataset.action === 'upgrade') {
            const confirmed = confirm(
                'Upgrade to the yearly plan?\n\nPaddle will apply prorated credit from your current monthly plan.'
            );
            if (!confirmed) {
                return;
            }
            await upgradeSubscription(priceId);
            await loadStatus();
            alert('Upgraded to yearly plan successfully.');
            return;
        }

        await openCheckout(priceId);
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
    document.getElementById('acceptTerms')?.addEventListener('change', () => {
        clearCheckoutError();
        refreshCheckoutButtons();
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    setupPolicyLinks();
    setupCheckoutButtons();
    await loadStatus();

    try {
        await loadBillingConfig();
        clearCheckoutError();
    } catch (error) {
        console.warn('Billing config preload failed:', error.message);
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
