// Background Service Worker - Etsy Review Scraper
importScripts('../utils/config.js', '../utils/subscription.js', '../utils/reviewFetcher.js');

console.log('🚀 Background service worker starting...');
console.log('🔗 API:', API_CONFIG.BASE_URL);

let etsyData = null;
let activeFetchPromise = null;
let fetchAborted = false;
let activeFetchTabId = null;
let activeOutputTabId = null;
let currentFetchSessionId = null;
let lastProgressReviews = [];
let lastJsDataSummary = null;
let lastFetchedPage = 0;
let lastFetchMethod = 'deepDive';

function resetFetchProgressState() {
    lastProgressReviews = [];
    lastJsDataSummary = null;
    lastFetchedPage = 0;
    lastFetchMethod = 'deepDive';
    activeFetchTabId = null;
    currentFetchSessionId = null;
}

function broadcastReviewMessage(message) {
    const payload = currentFetchSessionId
        ? { ...message, fetchSessionId: currentFetchSessionId }
        : message;
    chrome.runtime.sendMessage(payload).catch(() => {
        // output page may not be listening yet
    });
}

async function abortActiveFetch({ silent = false } = {}) {
    if (!activeFetchPromise && !activeFetchTabId) {
        resetFetchProgressState();
        fetchAborted = false;
        return;
    }

    fetchAborted = true;
    if (activeFetchTabId) {
        chrome.tabs.sendMessage(activeFetchTabId, { action: 'abortDomFallback' }).catch(() => {});
    }

    if (activeFetchPromise) {
        try {
            await activeFetchPromise;
        } catch (_) {
            // fetch was cancelled or failed
        }
    }

    resetFetchProgressState();
    fetchAborted = false;

    if (!silent) {
        console.log('🛑 Active review fetch aborted');
    }
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
                reviewCounts: response.reviewCounts || null,
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

async function startReviewFetch({ tabId, isProUser, freeLimit, delayMin, delayMax, reviewScope, sortOption, resumeFrom, fetchSessionId }) {
    fetchAborted = false;
    currentFetchSessionId = fetchSessionId || null;
    if (resumeFrom?.reviews?.length > 0) {
        lastProgressReviews = resumeFrom.reviews;
        lastJsDataSummary = resumeFrom.jsData || null;
        lastFetchedPage = resumeFrom.page || 0;
        lastFetchMethod = resumeFrom.method || 'deepDive';
    } else {
        lastProgressReviews = [];
        lastJsDataSummary = null;
        lastFetchedPage = 0;
        lastFetchMethod = 'deepDive';
    }
    activeFetchTabId = tabId;

    const data = await resolveEtsyData(tabId);
    if (!data) {
        throw new Error('Missing listing or shop ID. Refresh the Etsy listing page and try again.');
    }

    const shouldAbort = () => fetchAborted;

    const onProgress = (reviews, page, jsDataSummary, fetchMethod) => {
        if (fetchAborted) {
            return;
        }
        lastProgressReviews = reviews;
        lastFetchedPage = page;
        if (fetchMethod) {
            lastFetchMethod = fetchMethod;
        }
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
            jsData: jsDataSummary || lastJsDataSummary,
            fetchMethod: lastFetchMethod
        });
    };

    try {
        const result = await ReviewFetcher.fetchAllReviews(data, {
            isProUser,
            freeLimit,
            delayMin,
            delayMax,
            reviewScope,
            sortOption,
            onProgress,
            shouldAbort,
            resumeFrom
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
                jsData: lastJsDataSummary,
                lastPage: lastFetchedPage,
                fetchMethod: lastFetchMethod,
                resumeFrom: lastProgressReviews.length > 0 && lastFetchedPage > 0
                    ? {
                        page: lastFetchedPage,
                        reviews: lastProgressReviews,
                        jsData: lastJsDataSummary,
                        method: lastFetchMethod
                    }
                    : null
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
            reviewCounts: msg.reviewCounts || null,
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

    if (msg.type === 'getReviewScopeCounts') {
        (async () => {
            try {
                const data = msg.data || etsyData;
                const existing = data?.reviewCounts || {};
                const missingScopes = ['listingReviews', 'shopReviews'].filter(
                    (scope) => typeof existing[scope] !== 'number'
                );

                if (missingScopes.length === 0) {
                    sendResponse(existing);
                    return;
                }

                const fetched = await fetchReviewScopeCounts(data, { scopes: missingScopes });
                sendResponse({
                    listingReviews: existing.listingReviews ?? fetched.listingReviews ?? null,
                    shopReviews: existing.shopReviews ?? fetched.shopReviews ?? null
                });
            } catch (error) {
                sendResponse({
                    listingReviews: null,
                    shopReviews: null,
                    error: error.message
                });
            }
        })();
        return true;
    }

    if (msg.type === 'stopReviewFetch') {
        abortActiveFetch({ silent: true })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }

    if (msg.type === 'abortReviewFetch') {
        abortActiveFetch({ silent: true })
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }

    if (msg.type === 'startReviewFetch') {
        const outputTabId = sender.tab?.id || null;

        (async () => {
            try {
                if (!msg.resumeFrom) {
                    await abortActiveFetch({ silent: true });
                } else if (activeFetchPromise) {
                    sendResponse({ error: 'Review fetch already in progress' });
                    return;
                }

                activeOutputTabId = outputTabId;
                activeFetchPromise = startReviewFetch(msg);
                const result = await activeFetchPromise;
                sendResponse({ success: true, ...result });
            } catch (error) {
                sendResponse({ error: error.message || 'Failed to fetch reviews' });
            } finally {
                activeFetchPromise = null;
                if (activeOutputTabId === outputTabId) {
                    activeOutputTabId = null;
                }
            }
        })();

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
                if (SubscriptionHelper.hasProAccess(subscription)) {
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
        } else if (response.status === 401 || response.status === 403) {
            console.log('Token expired or access denied');
            return { status: 'not_authenticated' };
        } else if (response.status === 404) {
            return { status: 'none' };
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

if (chrome.tabs && chrome.tabs.onRemoved) {
    chrome.tabs.onRemoved.addListener((tabId) => {
        if (tabId === activeOutputTabId) {
            console.log('📄 Output page closed, aborting fetch');
            activeOutputTabId = null;
            abortActiveFetch({ silent: true });
        }
    });
    console.log('✅ Tab removed listener registered');
}

console.log('✅ Background service worker loaded successfully');
