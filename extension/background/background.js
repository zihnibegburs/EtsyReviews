// Background Service Worker - Etsy Review Scraper
importScripts('../utils/config.js');

console.log('🚀 Background service worker starting...');
console.log('🔗 API:', API_CONFIG.BASE_URL);

// Store Etsy data
let etsyData = null;

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('📨 Background received message:', msg.type, 'from:', sender.tab ? 'content script' : 'popup');

    if (msg.type === "etsyData") {
        // Store Etsy data from content script
        etsyData = {
            csrfToken: msg.csrfToken,
            listingId: msg.listingId,
            shopId: msg.shopId,
            listingUrl: msg.listingUrl || null,
            isExternalReferrer: !!msg.isExternalReferrer,
            categoryPath: msg.categoryPath || []
        };
        console.log('💾 Stored Etsy data:', {
            listingId: etsyData.listingId,
            shopId: etsyData.shopId,
            hasCsrf: !!etsyData.csrfToken,
            timestamp: new Date().toLocaleTimeString()
        });
        sendResponse({ success: true });
        return false;
    }

    if (msg.type === "getEtsyData") {
        // Send Etsy data to popup
        console.log('📤 Sending Etsy data to popup:', etsyData ? {
            listingId: etsyData.listingId,
            shopId: etsyData.shopId,
            hasCsrf: !!etsyData.csrfToken
        } : 'null');
        sendResponse(etsyData);
        return false;
    }

    if (msg.type === "checkSubscription") {
        checkSubscriptionStatus()
            .then(result => {
                console.log('✅ Subscription check complete:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('❌ Check subscription error:', error);
                sendResponse({ error: error.message });
            });
        return true; // Async response
    }

    console.warn('⚠️ Unknown message type:', msg.type);
    sendResponse({ error: 'Unknown message type' });
    return false;
});

// Check subscription status
async function checkSubscriptionStatus() {
    try {
        const result = await chrome.storage.local.get(['auth_token']);
        const token = result.auth_token;

        if (!token) {
            console.log('No auth token found');
            return { status: 'not_authenticated' };
        }

        console.log('Checking subscription with token...');

        const response = await fetch(`${API_CONFIG.BASE_URL}/subscription/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const subscription = await response.json();
            console.log('Subscription status:', subscription.status);

            if (chrome.action) {
                if (subscription.status === 'ACTIVE') {
                    await chrome.action.setBadgeText({ text: '✓' });
                    await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
                } else {
                    await chrome.action.setBadgeText({ text: '!' });
                    await chrome.action.setBadgeBackgroundColor({ color: '#FFC107' });
                }
            }

            await chrome.storage.local.set({
                subscription_data: subscription,
                last_sync: Date.now()
            });

            return subscription;
        } else if (response.status === 401) {
            console.log('Token expired');
            return { status: 'not_authenticated' };
        } else {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to check subscription:', error);
        return { error: error.message };
    }
}

// Listen for tab updates
if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('etsy.com/listing/')) {
            console.log('🔍 Etsy listing page detected:', tab.url);
        }
    });
    console.log('✅ Tab update listener registered');
}

console.log('✅ Background service worker loaded successfully');

