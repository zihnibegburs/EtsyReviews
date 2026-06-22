// DOM Elements
const loginScreen = document.getElementById('loginScreen');
const mainScreen = document.getElementById('mainScreen');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const userAvatar = document.getElementById('userAvatar');
const statusText = document.getElementById('statusText');
const etsyDataCard = document.getElementById('etsyDataCard');
const displayListingId = document.getElementById('displayListingId');
const displayShopId = document.getElementById('displayShopId');
const displayStatus = document.getElementById('displayStatus');
const fetchReviews = document.getElementById('fetchReviews');
const refreshBtn = document.getElementById('refreshBtn');
const statusBadge = document.getElementById('statusBadge');

// Tab Elements
const tabHome = document.getElementById('tabHome');
const tabPurchase = document.getElementById('tabPurchase');
const tabFAQ = document.getElementById('tabFAQ');
const tabSettings = document.getElementById('tabSettings');
const pageHome = document.getElementById('pageHome');
const pagePurchase = document.getElementById('pagePurchase');
const pageFAQ = document.getElementById('pageFAQ');
const pageSettings = document.getElementById('pageSettings');

// Purchase Page Elements
const buyMonthly = document.getElementById('buyMonthly');
const buyYearly = document.getElementById('buyYearly');
const currentPlan = document.getElementById('currentPlan');
const currentPlanExpiry = document.getElementById('currentPlanExpiry');

// Settings Page Elements
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
const saveDelayBtn = document.getElementById('saveDelayBtn');
const currentDelayRange = document.getElementById('currentDelayRange');

// Subscription settings
const settingsSubscriptionStatus = document.getElementById('settingsSubscriptionStatus');
const settingsSubscriptionRenewal = document.getElementById('settingsSubscriptionRenewal');
const cancelSubscriptionBtn = document.getElementById('cancelSubscriptionBtn');
const reactivateSubscriptionBtn = document.getElementById('reactivateSubscriptionBtn');

// State
let etsyData = null;
let isAuthenticated = false;

console.log('🚀 Popup script loaded');

// =============== INITIALIZATION ===============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📋 DOM Content Loaded');
    await initializeApp();
});

async function initializeApp() {
    console.log('🔄 Initializing app...');

    // Check authentication first
    const authenticated = await checkAuthStatus();

    if (authenticated) {
        // User is authenticated, show main screen
        showMainScreen();

        // Always request fresh Etsy data on every popup open
        console.log('🔍 Requesting fresh Etsy data...');
        requestEtsyData();

        // Load subscription status
        loadSubscriptionData();
    } else {
        // User not authenticated, show login screen
        showLoginScreen();
    }
}

// =============== AUTHENTICATION ===============
async function checkAuthStatus() {
    console.log('🔐 Checking authentication...');

    try {
        const token = await StorageManager.getToken();
        const cachedUser = await StorageManager.getUser();

        if (!token) {
            console.log('❌ No token found');
            return false;
        }

        console.log('✅ Token found');

        // If we have cached user data, use it without validation
        if (cachedUser) {
            console.log('✅ Using cached user data:', cachedUser.email);
            isAuthenticated = true;
            updateUserDisplay(cachedUser);

            // Optional: Validate token in background (don't block UI)
            validateTokenInBackground(token, cachedUser);

            return true;
        }

        // No cached user data, validate with backend
        console.log('📡 Validating token with backend...');
        const userData = await API.getCurrentUser();

        if (userData) {
            console.log('✅ User authenticated:', userData.email);
            isAuthenticated = true;

            // Cache user data
            await StorageManager.setUser(userData);
            updateUserDisplay(userData);
            return true;
        } else {
            console.log('❌ Token invalid (401)');
            await StorageManager.clear();
            return false;
        }
    } catch (error) {
        console.error('❌ Auth check failed:', error);

        // If we have cached user, don't clear on network errors
        const cachedUser = await StorageManager.getUser();
        if (cachedUser) {
            console.log('⚠️ Network error but using cached user data');
            isAuthenticated = true;
            updateUserDisplay(cachedUser);
            return true;
        }

        // Only clear if it's a 401 error, not network error
        if (error.message && error.message.includes('401')) {
            console.log('❌ Unauthorized, clearing session');
            await StorageManager.clear();
        }

        return false;
    }
}

// Background token validation (non-blocking)
async function validateTokenInBackground(token, cachedUser) {
    try {
        const userData = await API.getCurrentUser();

        if (!userData) {
            // Token is invalid, clear session
            console.log('⚠️ Background validation failed, clearing session');
            await StorageManager.clear();
            isAuthenticated = false;
            showLoginScreen();
        } else if (userData.email !== cachedUser.email) {
            // User changed, update cache
            console.log('📝 User data updated in background');
            await StorageManager.setUser(userData);
            updateUserDisplay(userData);
        }
    } catch (error) {
        // Ignore network errors in background validation
        console.log('⚠️ Background validation error (ignored):', error.message);
    }
}

function updateUserDisplay(user) {
    userName.textContent = user.name || 'User';
    userEmail.textContent = user.email || '';

    if (user.picture || user.pictureUrl) {
        userAvatar.src = user.picture || user.pictureUrl;
    } else {
        // Default avatar
        userAvatar.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect fill="%23F1641E" width="40" height="40"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="20" font-family="Arial">U</text></svg>';
    }
}

function showLoginScreen() {
    console.log('📱 Showing login screen');
    loginScreen.classList.remove('hidden');
    loginScreen.classList.add('active');
    mainScreen.classList.add('hidden');
    mainScreen.classList.remove('active');
}

function showMainScreen() {
    console.log('📱 Showing main screen');
    loginScreen.classList.add('hidden');
    loginScreen.classList.remove('active');
    mainScreen.classList.remove('hidden');
    mainScreen.classList.add('active');
}

// =============== LOGIN HANDLER ===============
loginBtn.addEventListener('click', handleLogin);

async function getGoogleAccessToken() {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!token) {
                reject(new Error('No OAuth token received'));
                return;
            }
            resolve(token);
        });
    });
}

function setLoginLoading(loading) {
    loginBtn.disabled = loading;
    loginBtn.classList.toggle('loading', loading);
}

async function handleLogin() {
    console.log('🔑 Login button clicked');
    console.log('🆔 Extension ID:', chrome.runtime.id);

    setLoginLoading(true);

    try {
        const token = await getGoogleAccessToken();
        console.log('✅ Got OAuth token');

        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!userInfoResponse.ok) {
            throw new Error('Failed to get user info from Google');
        }

        const googleUserInfo = await userInfoResponse.json();
        console.log('✅ Google user info received:', googleUserInfo.email);

        console.log('📡 Verifying with backend...');
        const response = await API.loginWithGoogle(token, googleUserInfo);
        console.log('✅ Backend response received');

        if (response && response.token) {
            console.log('✅ Login successful');

            await StorageManager.setToken(response.token);
            await StorageManager.setUser(response.user);

            isAuthenticated = true;
            updateUserDisplay(response.user);
            showMainScreen();
            requestEtsyData();
            loadSubscriptionData();
        } else {
            throw new Error('Invalid response from server');
        }
    } catch (error) {
        console.error('❌ Login failed:', error);
        alert('Login failed: ' + error.message);
    } finally {
        setLoginLoading(false);
    }
}

// =============== LOGOUT HANDLER ===============
logoutBtn.addEventListener('click', async () => {
    console.log('🚪 Logout clicked');

    try {
        // Clear storage
        await StorageManager.clear();

        chrome.identity.getAuthToken({ interactive: false }, (token) => {
            if (token) {
                chrome.identity.removeCachedAuthToken({ token }, () => {
                    console.log('✅ OAuth token removed');
                });
            }
        });

        // Update state
        isAuthenticated = false;
        etsyData = null;

        // Show login screen
        showLoginScreen();

        console.log('✅ Logout complete');
    } catch (error) {
        console.error('❌ Logout failed:', error);
    }
});

// =============== ETSY DATA HANDLING ===============
function isEtsyListingUrl(url) {
    return !!url && /etsy\.com\/listing\//i.test(url);
}

async function ensureContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content/content.js']
        });
        return true;
    } catch (error) {
        console.warn('⚠️ Could not inject content script:', error.message);
        return false;
    }
}

async function collectEtsyDataFromTab(tabId, maxRetries = 12, intervalMs = 400) {
    let injected = false;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const data = await chrome.tabs.sendMessage(tabId, { action: 'collectEtsyData' });
            if (data?.listingId && data?.shopId) {
                return data;
            }
            if (data?.listingId) {
                console.log(`Attempt ${attempt + 1}: listing found, waiting for shop ID...`);
            }
        } catch (error) {
            if (!injected) {
                injected = await ensureContentScript(tabId);
                if (injected) {
                    await new Promise((resolve) => setTimeout(resolve, 300));
                    continue;
                }
            }
            console.log(`Attempt ${attempt + 1}: content script unavailable`, error.message);
        }

        if (attempt < maxRetries - 1) {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'getEtsyData' }, (cached) => {
            if (chrome.runtime.lastError) {
                resolve(null);
                return;
            }
            resolve(cached?.listingId && cached?.shopId ? cached : null);
        });
    });
}

function applyEtsyData(data) {
    if (!data?.listingId || !data?.shopId) {
        console.warn('⚠️ Incomplete Etsy data');
        etsyData = null;
        etsyDataCard.classList.add('hidden');
        fetchReviews.disabled = true;
        setStatusText('Missing listing or shop ID — try refreshing the page', 'warning');
        return;
    }

    console.log('✅ Etsy data present');
    etsyData = data;
    updateEtsyDataDisplay(data);
    fetchReviews.disabled = false;
    setStatusText('Listing detected — ready to fetch', 'success');
}

async function requestEtsyData() {
    if (!isAuthenticated) {
        console.warn('⚠️ Not authenticated, skipping Etsy data request');
        return;
    }

    console.log('🔍 Requesting Etsy data...');

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab?.url || !isEtsyListingUrl(tab.url)) {
            console.log('⚠️ Active tab is not an Etsy listing page');
            etsyData = null;
            etsyDataCard.classList.add('hidden');
            fetchReviews.disabled = true;
            setStatusText('Navigate to an Etsy listing page first', 'navigate');
            return;
        }

        console.log('✅ Active tab is an Etsy listing page');
        setStatusText('Detecting listing...', 'muted');
        etsyDataCard.classList.add('hidden');
        fetchReviews.disabled = true;

        const data = await collectEtsyDataFromTab(tab.id);
        console.log('📦 Received Etsy data:', data);

        if (!data) {
            console.warn('⚠️ No data received');
            etsyData = null;
            etsyDataCard.classList.add('hidden');
            fetchReviews.disabled = true;
            setStatusText('Could not read listing data — try refreshing the page', 'warning');
            return;
        }

        applyEtsyData(data);
    } catch (error) {
        console.error('❌ Error checking active tab:', error);
        etsyData = null;
        etsyDataCard.classList.add('hidden');
        fetchReviews.disabled = true;
        setStatusText('Failed to detect listing — try again', 'warning');
    }
}

function setStatusText(message, variant) {
    statusText.textContent = message;
    statusText.className = 'status-text ' + (variant || 'muted');
}

function updateEtsyDataDisplay(data) {
    etsyDataCard.classList.remove('hidden');
    displayListingId.textContent = data.listingId || '-';
    displayShopId.textContent = data.shopId || '-';
    displayStatus.textContent = 'Ready';
    displayStatus.className = 'status-badge active';
}

refreshBtn.addEventListener('click', async () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }
    console.log('🔄 Refreshing Etsy page...');

    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab) {
            console.warn('⚠️ No active tab found');
            alert('No active tab found');
            return;
        }

        // Check if it's an Etsy listing page
        if (!isEtsyListingUrl(tab.url)) {
            console.warn('⚠️ Not on Etsy listing page');
            alert('Please navigate to an Etsy listing page first');
            return;
        }

        console.log('🔄 Reloading tab:', tab.id);

        // Reload the page
        await chrome.tabs.reload(tab.id);

        // Wait a bit for content script to collect data
        setTimeout(() => {
            console.log('🔍 Requesting updated Etsy data...');
            requestEtsyData();
        }, 2000);

    } catch (error) {
        console.error('❌ Refresh failed:', error);
        alert('Failed to refresh page: ' + error.message);
    }
});

fetchReviews.addEventListener('click', async () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !isEtsyListingUrl(tab.url)) {
        alert('Please open an Etsy listing page first.\n\nExample:\nhttps://www.etsy.com/listing/1020427168/...');
        return;
    }

    const reviewScope = document.querySelector('input[name="reviewScope"]:checked')?.value || 'shopReviews';
    const sortOption = document.getElementById('sortOption')?.value || 'Relevancy';
    const params = new URLSearchParams({
        tabId: String(tab.id),
        reviewScope,
        sortOption
    });

    console.log('📋 Opening reviews page for tab:', tab.id, { reviewScope, sortOption });
    chrome.tabs.create({ url: chrome.runtime.getURL(`output.html?${params.toString()}`) });
});

// =============== SUBSCRIPTION ===============
async function loadSubscriptionData() {
    if (!isAuthenticated) {
        console.warn('⚠️ Not authenticated, skipping subscription check');
        return;
    }

    console.log('💎 Loading subscription data...');

    try {
        const subscription = await API.getSubscription();
        console.log('✅ Subscription data:', subscription);

        if (API.hasProAccess(subscription)) {
            statusBadge.textContent = 'PRO';
            statusBadge.className = 'status-badge active';
        } else {
            statusBadge.textContent = 'FREE';
            statusBadge.className = 'status-badge inactive';
        }
    } catch (error) {
        console.error('❌ Failed to load subscription:', error);
        statusBadge.textContent = 'FREE';
        statusBadge.className = 'status-badge inactive';
    }
}

// =============== TAB SWITCHING ===============
function showTab(tabName) {
    const pages = { home: pageHome, purchase: pagePurchase, faq: pageFAQ, settings: pageSettings };
    const tabs = { home: tabHome, purchase: tabPurchase, faq: tabFAQ, settings: tabSettings };

    Object.values(pages).forEach(p => p.classList.remove('active'));
    Object.values(tabs).forEach(t => t.classList.remove('active'));

    if (pages[tabName]) pages[tabName].classList.add('active');
    if (tabs[tabName]) tabs[tabName].classList.add('active');

    if (tabName === 'purchase') loadPurchasePageData();
    if (tabName === 'settings') loadSettingsPageData();
}

tabHome.addEventListener('click', () => showTab('home'));
tabPurchase.addEventListener('click', () => showTab('purchase'));
tabFAQ.addEventListener('click', () => showTab('faq'));
tabSettings.addEventListener('click', () => showTab('settings'));

// =============== PURCHASE PAGE ===============
async function getStripePriceConfig() {
    try {
        const response = await fetch(`${API.BASE_URL}/stripe/config`, {
            headers: await API.getHeaders(true)
        });
        if (response.ok) {
            const data = await response.json();
            if (data?.priceIdMonthly && data?.priceIdYearly) {
                return data;
            }
        }
    } catch (error) {
        console.warn('Could not load Stripe config from API:', error.message);
    }

    if (API_CONFIG.STRIPE_PRICE_ID_MONTHLY && API_CONFIG.STRIPE_PRICE_ID_YEARLY) {
        return {
            priceIdMonthly: API_CONFIG.STRIPE_PRICE_ID_MONTHLY,
            priceIdYearly: API_CONFIG.STRIPE_PRICE_ID_YEARLY
        };
    }

    return null;
}

async function loadPurchasePageData() {
    if (!isAuthenticated) return;

    try {
        const [subscription, priceConfig] = await Promise.all([
            API.getSubscription(),
            getStripePriceConfig()
        ]);
        const hasActive = API.hasProAccess(subscription);
        const isPendingCancel = API.isPendingCancel(subscription);
        const periodEnd = formatSubscriptionDate(subscription?.currentPeriodEnd);
        const monthlyPriceId = priceConfig?.priceIdMonthly;
        const yearlyPriceId = priceConfig?.priceIdYearly;
        const isMonthly = hasActive && monthlyPriceId && subscription.planId === monthlyPriceId;
        const isYearly = hasActive && yearlyPriceId && subscription.planId === yearlyPriceId;

        if (hasActive) {
            currentPlan.textContent = 'PRO';
            currentPlan.className = 'status-badge active';

            if (isYearly) {
                buyMonthly.disabled = true;
                buyMonthly.textContent = 'Monthly';
                delete buyMonthly.dataset.action;
                buyYearly.disabled = true;
                buyYearly.textContent = 'Current Plan';
                delete buyYearly.dataset.action;
            } else if (isMonthly) {
                buyMonthly.disabled = true;
                buyMonthly.textContent = 'Current Plan';
                delete buyMonthly.dataset.action;

                if (isPendingCancel) {
                    buyYearly.disabled = true;
                    buyYearly.textContent = 'Reactivate in Settings';
                    delete buyYearly.dataset.action;
                } else {
                    buyYearly.disabled = false;
                    buyYearly.textContent = 'Upgrade to Yearly';
                    buyYearly.dataset.action = 'upgrade';
                }
            } else {
                buyMonthly.disabled = true;
                buyMonthly.textContent = 'Current Plan';
                delete buyMonthly.dataset.action;
                buyYearly.disabled = true;
                buyYearly.textContent = 'Current Plan';
                delete buyYearly.dataset.action;
            }

            if (periodEnd) {
                currentPlanExpiry.textContent = isPendingCancel
                    ? `Ends on ${periodEnd}`
                    : `Renews on ${periodEnd}`;
                currentPlanExpiry.classList.remove('hidden');
            } else {
                currentPlanExpiry.textContent = '';
                currentPlanExpiry.classList.add('hidden');
            }
        } else {
            currentPlan.textContent = 'FREE';
            currentPlan.className = 'status-badge inactive';
            buyMonthly.disabled = false;
            buyYearly.disabled = false;
            buyMonthly.textContent = 'Get Monthly';
            buyYearly.textContent = 'Get Yearly';
            delete buyMonthly.dataset.action;
            delete buyYearly.dataset.action;
            currentPlanExpiry.textContent = '';
            currentPlanExpiry.classList.add('hidden');
        }
    } catch (error) {
        console.error('❌ Failed to load purchase page data:', error);
        currentPlan.textContent = 'FREE';
        currentPlan.className = 'status-badge inactive';
        buyMonthly.disabled = false;
        buyYearly.disabled = false;
        buyMonthly.textContent = 'Get Monthly';
        buyYearly.textContent = 'Get Yearly';
        delete buyMonthly.dataset.action;
        delete buyYearly.dataset.action;
        currentPlanExpiry.textContent = '';
        currentPlanExpiry.classList.add('hidden');
    }
}

buyMonthly.addEventListener('click', async () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }
    if (buyMonthly.disabled) {
        alert('You already have an active PRO subscription.');
        return;
    }

    console.log('💳 Opening checkout page...');
    chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
});

buyYearly.addEventListener('click', async () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    if (buyYearly.dataset.action === 'upgrade') {
        const confirmed = confirm(
            'Upgrade to the yearly plan?\n\nStripe will apply prorated credit from your current monthly plan.'
        );
        if (!confirmed) {
            return;
        }

        buyYearly.disabled = true;
        const originalLabel = buyYearly.textContent;
        buyYearly.textContent = 'Upgrading...';

        try {
            const priceConfig = await getStripePriceConfig();
            if (!priceConfig?.priceIdYearly) {
                throw new Error('Could not load yearly plan price');
            }

            await API.upgradeSubscription(priceConfig.priceIdYearly);
            await loadPurchasePageData();
            loadSubscriptionData();
            alert('Upgraded to yearly plan successfully.');
        } catch (error) {
            console.error('❌ Upgrade failed:', error);
            alert('Failed to upgrade: ' + error.message);
            await loadPurchasePageData();
        } finally {
            if (buyYearly.textContent === 'Upgrading...') {
                buyYearly.textContent = originalLabel;
            }
        }
        return;
    }

    if (buyYearly.disabled) {
        alert('You already have an active PRO subscription.');
        return;
    }

    console.log('💳 Opening checkout page...');
    chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
});

// =============== SETTINGS PAGE ===============
function formatSubscriptionDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function updateSubscriptionSettingsUI(subscription) {
    const hasActive = API.hasProAccess(subscription);
    const isPendingCancel = API.isPendingCancel(subscription);
    const renewsAt = formatSubscriptionDate(subscription?.currentPeriodEnd);

    if (hasActive) {
        settingsSubscriptionStatus.textContent = 'PRO';
        settingsSubscriptionStatus.className = 'status-badge active';

        if (isPendingCancel) {
            settingsSubscriptionRenewal.textContent = renewsAt
                ? `Cancels on ${renewsAt}`
                : 'Cancellation scheduled';
            cancelSubscriptionBtn.disabled = true;
            cancelSubscriptionBtn.textContent = 'Cancellation scheduled';
            cancelSubscriptionBtn.classList.add('hidden');
            reactivateSubscriptionBtn.classList.remove('hidden');
            reactivateSubscriptionBtn.disabled = false;
            reactivateSubscriptionBtn.textContent = 'Reactivate subscription';
        } else {
            settingsSubscriptionRenewal.textContent = renewsAt
                ? `Renews on ${renewsAt}`
                : 'Active subscription';
            cancelSubscriptionBtn.disabled = false;
            cancelSubscriptionBtn.textContent = 'Cancel subscription';
            cancelSubscriptionBtn.classList.remove('hidden');
            reactivateSubscriptionBtn.classList.add('hidden');
            reactivateSubscriptionBtn.disabled = true;
        }
    } else {
        settingsSubscriptionStatus.textContent = 'FREE';
        settingsSubscriptionStatus.className = 'status-badge inactive';
        settingsSubscriptionRenewal.textContent = 'No active subscription';
        cancelSubscriptionBtn.disabled = true;
        cancelSubscriptionBtn.textContent = 'Cancel subscription';
        cancelSubscriptionBtn.classList.remove('hidden');
        reactivateSubscriptionBtn.classList.add('hidden');
        reactivateSubscriptionBtn.disabled = true;
    }
}

async function loadSettingsPageData() {
    if (!isAuthenticated) return;

    try {
        const delayConfig = await StorageManager.getDelayConfig();
        minDelayInput.value = delayConfig.min;
        maxDelayInput.value = delayConfig.max;
        currentDelayRange.textContent = `${delayConfig.min}–${delayConfig.max} sec`;

        const subscription = await API.getSubscription();
        updateSubscriptionSettingsUI(subscription);
    } catch (error) {
        console.error('❌ Failed to load settings page data:', error);
        updateSubscriptionSettingsUI(null);
    }
}

cancelSubscriptionBtn.addEventListener('click', async () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    if (cancelSubscriptionBtn.disabled) {
        return;
    }

    const confirmed = confirm(
        'Cancel your PRO subscription?\n\nYou will keep PRO access until the end of the current billing period.'
    );
    if (!confirmed) {
        return;
    }

    cancelSubscriptionBtn.disabled = true;
    cancelSubscriptionBtn.textContent = 'Cancelling...';

    try {
        const subscription = await API.cancelSubscription();
        updateSubscriptionSettingsUI(subscription);
        loadSubscriptionData();
        loadPurchasePageData();
        alert('Subscription cancelled. PRO access continues until the end of your billing period.');
    } catch (error) {
        console.error('❌ Failed to cancel subscription:', error);
        alert('Failed to cancel subscription: ' + error.message);
        await loadSettingsPageData();
    }
});

reactivateSubscriptionBtn.addEventListener('click', async () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }

    if (reactivateSubscriptionBtn.disabled) {
        return;
    }

    const confirmed = confirm(
        'Reactivate your PRO subscription?\n\nBilling will continue as normal at the end of the current period.'
    );
    if (!confirmed) {
        return;
    }

    reactivateSubscriptionBtn.disabled = true;
    reactivateSubscriptionBtn.textContent = 'Reactivating...';

    try {
        const subscription = await API.reactivateSubscription();
        updateSubscriptionSettingsUI(subscription);
        loadSubscriptionData();
        loadPurchasePageData();
        alert('Subscription reactivated successfully.');
    } catch (error) {
        console.error('❌ Failed to reactivate subscription:', error);
        alert('Failed to reactivate subscription: ' + error.message);
        await loadSettingsPageData();
    }
});

saveDelayBtn.addEventListener('click', async () => {
    const min = parseInt(minDelayInput.value);
    const max = parseInt(maxDelayInput.value);

    if (isNaN(min) || isNaN(max)) {
        alert('Please enter valid numbers');
        return;
    }

    if (min < 1 || min > 100 || max < 1 || max > 100) {
        alert('Values must be between 1 and 100');
        return;
    }

    if (min > max) {
        alert('Min delay cannot be greater than max delay');
        return;
    }

    try {
        await StorageManager.setDelayConfig(min, max);
        currentDelayRange.textContent = `${min}–${max} sec`;
        alert('Delay configuration saved.');
        console.log('✅ Delay config saved:', { min, max });
    } catch (error) {
        console.error('❌ Failed to save delay config:', error);
        alert('Failed to save configuration');
    }
});


console.log('✅ Popup script initialized');
