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

// Settings Page Elements
const minDelayInput = document.getElementById('minDelay');
const maxDelayInput = document.getElementById('maxDelay');
const saveDelayBtn = document.getElementById('saveDelayBtn');
const currentDelayRange = document.getElementById('currentDelayRange');

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

async function handleLogin() {
    console.log('🔑 Login button clicked');
    console.log('🆔 Extension ID:', chrome.runtime.id);

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
async function requestEtsyData() {
    if (!isAuthenticated) {
        console.warn('⚠️ Not authenticated, skipping Etsy data request');
        return;
    }

    console.log('🔍 Requesting Etsy data...');

    let isOnListingPage = false;

    try {
        // Check if current tab is an Etsy listing page
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.url && tab.url.includes('etsy.com/listing/')) {
            isOnListingPage = true;
            console.log('✅ Active tab is an Etsy listing page');
            console.log('🔄 Triggering content script to collect fresh data...');

            // Inject and execute content script to collect fresh data
            try {
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content/content.js']
                });
                console.log('✅ Content script injected');
            } catch (error) {
                console.log('⚠️ Content script may already be loaded:', error.message);
            }

            // Wait a moment for content script to collect data
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            console.log('⚠️ Active tab is not an Etsy listing page');
        }
    } catch (error) {
        console.error('❌ Error checking active tab:', error);
    }

    // If not on listing page, show "Navigate to Etsy listing" message
    if (!isOnListingPage) {
        console.log('❌ Not on listing page, showing navigation message');
        etsyData = null;
        etsyDataCard.classList.add('hidden');
        fetchReviews.disabled = true;
        setStatusText('Navigate to an Etsy listing page first', 'muted');
        return;
    }

    // Only request data if we're on a listing page
    chrome.runtime.sendMessage({ type: "getEtsyData" }, (data) => {
        console.log('📦 Received Etsy data:', data);

        if (chrome.runtime.lastError) {
            console.error('❌ Runtime error:', chrome.runtime.lastError);
            return;
        }

        if (!data) {
            console.warn('⚠️ No data received');
            etsyData = null;
            etsyDataCard.classList.add('hidden');
            fetchReviews.disabled = true;
            setStatusText('Navigate to an Etsy listing page first', 'muted');
            return;
        }

        if (!data.listingId || !data.shopId) {
            console.warn('⚠️ Incomplete data');
            fetchReviews.disabled = true;
            setStatusText('Missing listing or shop ID — try refreshing the page', 'warning');
            return;
        }

        // All data present
        console.log('✅ Etsy data present');

        etsyData = data;
        updateEtsyDataDisplay(data);
        fetchReviews.disabled = false;
        setStatusText('Listing detected — ready to fetch', 'success');
    });
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
        if (!tab.url || !tab.url.includes('etsy.com/listing/')) {
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

fetchReviews.addEventListener('click', () => {
    if (!isAuthenticated) {
        alert('Please login first');
        return;
    }
    console.log('📋 Opening reviews page...');
    chrome.tabs.create({ url: chrome.runtime.getURL("output.html") });
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

        if (subscription && subscription.status === 'ACTIVE') {
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
async function loadPurchasePageData() {
    if (!isAuthenticated) return;

    try {
        const subscription = await API.getSubscription();
        const hasActive = subscription && subscription.status === 'ACTIVE';

        if (hasActive) {
            currentPlan.textContent = 'PRO';
            currentPlan.className = 'status-badge active';
            buyMonthly.disabled = true;
            buyYearly.disabled = true;
            buyMonthly.textContent = 'Current Plan';
            buyYearly.textContent = 'Current Plan';
        } else {
            currentPlan.textContent = 'FREE';
            currentPlan.className = 'status-badge inactive';
            buyMonthly.disabled = false;
            buyYearly.disabled = false;
            buyMonthly.textContent = 'Get Monthly';
            buyYearly.textContent = 'Get Yearly';
        }
    } catch (error) {
        console.error('❌ Failed to load purchase page data:', error);
        currentPlan.textContent = 'FREE';
        currentPlan.className = 'status-badge inactive';
        buyMonthly.disabled = false;
        buyYearly.disabled = false;
        buyMonthly.textContent = 'Get Monthly';
        buyYearly.textContent = 'Get Yearly';
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
    if (buyYearly.disabled) {
        alert('You already have an active PRO subscription.');
        return;
    }

    console.log('💳 Opening checkout page...');
    chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
});

// =============== SETTINGS PAGE ===============
async function loadSettingsPageData() {
    if (!isAuthenticated) return;

    try {
        // Load delay configuration
        const delayConfig = await StorageManager.getDelayConfig();
        minDelayInput.value = delayConfig.min;
        maxDelayInput.value = delayConfig.max;
        currentDelayRange.textContent = `${delayConfig.min}–${delayConfig.max} sec`;
    } catch (error) {
        console.error('❌ Failed to load settings page data:', error);
    }
}

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
