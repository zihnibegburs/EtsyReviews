// Background Service Worker - Etsy Review Scraper
importScripts('../utils/config.js', '../utils/reviewFetcher.js');

console.log('🚀 Background service worker starting...');
console.log('🔗 API:', API_CONFIG.BASE_URL);

let etsyData = null;
let activeFetchPromise = null;
let fetchAborted = false;
let activeFetchTabId = null;
let lastProgressReviews = [];
let lastJsDataSummary = null;

function broadcastReviewMessage(message) {
    chrome.runtime.sendMessage(message).catch(() => {
        // output page may not be listening yet
    });
}

async function getEtsyDataFromTab(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, { action: 'collectEtsyData' });
        if (response?.listingId && response?.shopId) {
            etsyData = {
                csrfToken: response.csrfToken || null,
                listingId: response.listingId,
                shopId: response.shopId,
                listingUrl: response.listingUrl || null,
                isExternalReferrer: !!response.isExternalReferrer,
                categoryPath: []
            };
            return etsyData;
        }
    } catch (error) {
        console.warn('Could not collect Etsy data from tab:', error.message);
    }

    return null;
}

async function resolveEtsyData(tabId) {
    if (etsyData?.listingId && etsyData?.shopId && etsyData?.csrfToken) {
        return { ...etsyData };
    }

    const tabData = tabId ? await getEtsyDataFromTab(tabId) : null;
    if (tabData) {
        return { ...tabData };
    }

    if (etsyData?.listingId && etsyData?.shopId) {
        return { ...etsyData };
    }

    return null;
}

async function tryDomFallback(tabId, options) {
    if (!tabId || fetchAborted) {
        return null;
    }

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: 'fetchReviewsDomFallback',
            ...options
        });
        if (response?.cancelled || response?.reviews?.length) {
            return response;
        }
    } catch (error) {
        console.warn('DOM fallback unavailable:', error.message);
    }

    return null;
}

async function startReviewFetch({ tabId, isProUser, freeLimit, delayMin, delayMax }) {
    fetchAborted = false;
    lastProgressReviews = [];
    lastJsDataSummary = null;
    activeFetchTabId = tabId;

    const data = await resolveEtsyData(tabId);
    if (!data) {
        throw new Error('Missing listing or shop ID. Refresh the Etsy listing page and try again.');
    }

    const shouldAbort = () => fetchAborted;

    const onProgress = (reviews, page, jsDataSummary) => {
        if (fetchAborted) {
            return;
        }
        lastProgressReviews = reviews;
        if (jsDataSummary) {
            lastJsDataSummary = jsDataSummary;
        }
        broadcastReviewMessage({
            type: 'reviewProgress',
            listingId: data.listingId,
            shopId: data.shopId,
            page,
            total: reviews.length,
            reviews,
            limitReached: !isProUser && reviews.length >= freeLimit,
            jsData: jsDataSummary || lastJsDataSummary
        });
    };

    try {
        const result = await ReviewFetcher.fetchAllReviews(data, {
            isProUser,
            freeLimit,
            delayMin,
            delayMax,
            onProgress,
            shouldAbort
        });

        if (result.cancelled) {
            broadcastReviewMessage({ type: 'reviewCancelled', ...result });
        } else {
            broadcastReviewMessage({ type: 'reviewComplete', ...result });
        }
        return result;
    } catch (apiError) {
        if (fetchAborted) {
            const result = {
                listingId: data.listingId,
                shopId: data.shopId,
                reviews: lastProgressReviews,
                limitReached: !isProUser && lastProgressReviews.length >= freeLimit,
                cancelled: true,
                jsData: lastJsDataSummary
            };
            broadcastReviewMessage({ type: 'reviewCancelled', ...result });
            return result;
        }

        console.warn('API fetch failed, trying DOM fallback:', apiError.message);

        const domResult = await tryDomFallback(tabId, {
            isProUser,
            freeLimit,
            delayMin,
            delayMax
        });

        if (domResult?.cancelled) {
            const result = {
                listingId: domResult.listingId || data.listingId,
                shopId: domResult.shopId || data.shopId,
                reviews: domResult.reviews || [],
                limitReached: !isProUser && (domResult.reviews?.length || 0) >= freeLimit,
                cancelled: true
            };
            broadcastReviewMessage({ type: 'reviewCancelled', ...result });
            return result;
        }

        if (domResult?.reviews?.length) {
            const result = {
                listingId: domResult.listingId || data.listingId,
                shopId: domResult.shopId || data.shopId,
                reviews: domResult.reviews,
                limitReached: !isProUser && domResult.reviews.length >= freeLimit
            };
            broadcastReviewMessage({ type: 'reviewComplete', ...result });
            return result;
        }

        broadcastReviewMessage({
            type: 'reviewError',
            message: apiError.message || 'Failed to fetch reviews'
        });
        throw apiError;
    } finally {
        activeFetchTabId = null;
    }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log('📨 Background received message:', msg.type, 'from:', sender.tab ? 'content script' : 'extension page');

    if (msg.type === 'etsyData') {
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

    if (msg.type === 'getEtsyData') {
        console.log('📤 Sending Etsy data to popup:', etsyData ? {
            listingId: etsyData.listingId,
            shopId: etsyData.shopId,
            hasCsrf: !!etsyData.csrfToken
        } : 'null');
        sendResponse(etsyData);
        return false;
    }

    if (msg.type === 'stopReviewFetch') {
        fetchAborted = true;
        if (activeFetchTabId) {
            chrome.tabs.sendMessage(activeFetchTabId, { action: 'abortDomFallback' }).catch(() => {});
        }
        sendResponse({ success: true });
        return false;
    }

    if (msg.type === 'startReviewFetch') {
        if (activeFetchPromise) {
            sendResponse({ error: 'Review fetch already in progress' });
            return false;
        }

        activeFetchPromise = startReviewFetch(msg)
            .then((result) => {
                sendResponse({ success: true, ...result });
                return result;
            })
            .catch((error) => {
                sendResponse({ error: error.message || 'Failed to fetch reviews' });
                throw error;
            })
            .finally(() => {
                activeFetchPromise = null;
            });

        return true;
    }

    if (msg.type === 'checkSubscription') {
        checkSubscriptionStatus()
            .then((result) => {
                console.log('✅ Subscription check complete:', result);
                sendResponse(result);
            })
            .catch((error) => {
                console.error('❌ Check subscription error:', error);
                sendResponse({ error: error.message });
            });
        return true;
    }

    console.warn('⚠️ Unknown message type:', msg.type);
    sendResponse({ error: 'Unknown message type' });
    return false;
});

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
                Authorization: `Bearer ${token}`,
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

if (chrome.tabs && chrome.tabs.onUpdated) {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('etsy.com/listing/')) {
            console.log('🔍 Etsy listing page detected:', tab.url);
        }
    });
    console.log('✅ Tab update listener registered');
}

console.log('✅ Background service worker loaded successfully');
