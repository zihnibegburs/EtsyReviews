// Content Script for Etsy Listing Pages
if (window.__ETSY_REVIEW_SCRAPER_LOADED__) {
    console.log('🔄 Etsy Review Scraper - already loaded, skipping duplicate injection');
} else {
window.__ETSY_REVIEW_SCRAPER_LOADED__ = true;

console.log('🚀 Etsy Review Scraper - Content script loaded');
console.log('📍 Current URL:', window.location.href);

const LISTING_ID_PATTERN = /\/listing\/(\d+)/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findShopIdInObject(obj, depth = 0) {
    if (!obj || depth > 10 || typeof obj !== 'object') return null;

    if (obj.shop_id != null && /^\d+$/.test(String(obj.shop_id))) {
        return parseInt(String(obj.shop_id), 10);
    }
    if (obj.shopId != null && /^\d+$/.test(String(obj.shopId))) {
        return parseInt(String(obj.shopId), 10);
    }

    for (const value of Object.values(obj)) {
        const found = findShopIdInObject(value, depth + 1);
        if (found) return found;
    }

    return null;
}

function extractCsrfToken() {
    const metaToken = document.querySelector('meta[name="csrf_nonce"]')?.content ||
        document.querySelector('meta[name="x-csrf-token"]')?.content;
    if (metaToken) return metaToken;

    for (const script of document.querySelectorAll('script')) {
        const match = script.textContent.match(/"csrf_nonce"\s*:\s*"([^"]+)"/);
        if (match) return match[1];
    }

    return null;
}

function extractListingId() {
    if (window.__etsy_server_data__?.listing_id) {
        return parseInt(String(window.__etsy_server_data__.listing_id), 10);
    }

    const match = window.location.pathname.match(LISTING_ID_PATTERN);
    return match ? parseInt(match[1], 10) : null;
}

function extractShopIdFromListingJson() {
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
        try {
            const json = JSON.parse(script.textContent);
            if (json?.listing?.shop_id != null && /^\d+$/.test(String(json.listing.shop_id))) {
                return parseInt(String(json.listing.shop_id), 10);
            }
            if (json?.shop_id != null && json?.listing_id != null && /^\d+$/.test(String(json.shop_id))) {
                return parseInt(String(json.shop_id), 10);
            }
        } catch {
            // ignore invalid JSON blocks
        }
    }

    return null;
}

function extractShopId() {
    if (window.__etsy_server_data__?.shop_id) {
        return parseInt(String(window.__etsy_server_data__.shop_id), 10);
    }

    const listingJsonShopId = extractShopIdFromListingJson();
    if (listingJsonShopId) {
        return listingJsonShopId;
    }

    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        try {
            const json = JSON.parse(script.textContent);
            const items = Array.isArray(json) ? json : [json];
            for (const item of items) {
                const offers = item?.offers || item?.brand;
                const shopId = findShopIdInObject(item) || findShopIdInObject(offers);
                if (shopId) return shopId;
            }
        } catch {
            // ignore invalid JSON-LD
        }
    }

    for (const script of document.querySelectorAll('script[type="application/json"]')) {
        try {
            const shopId = findShopIdInObject(JSON.parse(script.textContent));
            if (shopId) return shopId;
        } catch {
            // ignore invalid JSON blocks
        }
    }

    for (const script of document.querySelectorAll('script')) {
        const match = script.textContent.match(/"shop_id"\s*:\s*(\d+)/);
        if (match) return parseInt(match[1], 10);
    }

    const dataShopId = document.querySelector('[data-shop-id]')?.getAttribute('data-shop-id');
    if (dataShopId && /^\d+$/.test(dataShopId)) {
        return parseInt(dataShopId, 10);
    }

    const shopLink = document.querySelector('a[href*="/shop/"]')?.getAttribute('href');
    const shopMatch = shopLink?.match(/shop_id=(\d+)/);
    if (shopMatch) return parseInt(shopMatch[1], 10);

    const bodyMatch = document.body?.innerHTML.match(/"shop_id"\s*:\s*(\d+)/);
    if (bodyMatch) return parseInt(bodyMatch[1], 10);

    return null;
}

function collectEtsyData() {
    const listingId = extractListingId();
    const shopId = extractShopId();
    const csrfToken = extractCsrfToken();
    const listingUrl = window.location.href;
    const isExternalReferrer = new URLSearchParams(window.location.search).get('external') === '1' ||
        (document.referrer && !document.referrer.includes('etsy.com'));

    return { listingId, shopId, csrfToken, listingUrl, isExternalReferrer };
}

function publishEtsyData() {
    const data = collectEtsyData();

    if (!data.listingId || !data.shopId) {
        return false;
    }

    chrome.runtime.sendMessage({
        type: 'etsyData',
        csrfToken: data.csrfToken || null,
        listingId: data.listingId,
        shopId: data.shopId,
        listingUrl: data.listingUrl,
        isExternalReferrer: data.isExternalReferrer,
        categoryPath: []
    }, () => {
        if (chrome.runtime.lastError) {
            console.error('❌ Error sending Etsy data:', chrome.runtime.lastError);
        }
    });

    return true;
}

function waitForEtsyData(maxRetries = 40, interval = 500) {
    let tries = 0;

    const check = () => {
        tries++;
        const data = collectEtsyData();

        console.log(`🔍 Attempt ${tries}/${maxRetries}`, {
            csrf: !!data.csrfToken,
            listingId: data.listingId,
            shopId: data.shopId
        });

        if (data.listingId && data.shopId) {
            console.log('✅ Etsy data complete');
            publishEtsyData();
            return;
        }

        if (tries < maxRetries) {
            setTimeout(check, interval);
        } else {
            console.error('❌ Failed to scrape Etsy data after retries', data);
        }
    };

    check();
}

function formatReviewDate(raw) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return raw;
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function parseDeepDiveReviewNode(node) {
    const reviewId = node.getAttribute('data-review-region') || null;
    const ratingLabel = node.querySelector('[role="img"][aria-label*="Rating"]')?.getAttribute('aria-label') || '';
    const ratingMatch = ratingLabel.match(/Rating:\s*(\d)/i) || ratingLabel.match(/(\d)\s*out of/i);
    const rating = ratingMatch ? parseInt(ratingMatch[1], 10) : 0;

    const reviewer = node.querySelector('a[href*="/people/"]')?.textContent?.trim() ||
        node.querySelector('a.wt-text-link-no-underline')?.textContent?.trim() ||
        'Anonymous';

    const dateRaw = node.querySelector('span.wt-text-body-small--tight, .wt-text-body-small')?.textContent?.trim() || '';
    const itemLinkEl = node.querySelector('a[href*="/listing/"]');
    const item = itemLinkEl?.textContent?.trim() || '';
    const itemUrl = itemLinkEl?.getAttribute('href') || '';
    const itemListingId = itemUrl.match(/\/listing\/(\d+)/)?.[1];

    const textCandidates = Array.from(node.querySelectorAll('.wt-text-body'))
        .map((el) => el.textContent?.trim())
        .filter(Boolean);
    const text = textCandidates.find((value) => value !== item && !/^Purchased item:/i.test(value)) || textCandidates[0] || '';

    if (!text && rating === 0 && !reviewId) {
        return null;
    }

    return {
        reviewId,
        reviewer,
        rating,
        text,
        item,
        itemUrl,
        listingId: itemListingId ? parseInt(itemListingId, 10) : null,
        date: formatReviewDate(dateRaw)
    };
}

function parseReviewCardNode(node) {
    const reviewer = node.querySelector(
        'a.wt-text-link-no-underline, [data-reviewer-name], .shop2-review-byline a'
    )?.textContent?.trim() || 'Anonymous';

    const ratingValue = node.querySelector('input[name="rating"]')?.value ||
        node.querySelector('[aria-label*="out of 5"]')?.getAttribute('aria-label')?.match(/(\d)/)?.[1] ||
        '0';

    const text = node.querySelector('.wt-text-body, [data-review-text], p')?.textContent?.trim() || '';
    const itemLinkEl = node.querySelector('a[href*="/listing/"]');
    const item = itemLinkEl?.textContent?.trim() || '';
    const dateRaw = node.querySelector('.wt-text-body-small, time, .wt-text-caption')?.textContent?.trim() || '';

    if (!text && !parseInt(ratingValue, 10)) {
        return null;
    }

    return {
        reviewer,
        rating: parseInt(ratingValue, 10) || 0,
        text,
        item,
        itemUrl: itemLinkEl?.getAttribute('href') || '',
        date: formatReviewDate(dateRaw)
    };
}

function parseReviewsFromDocument() {
    const seen = new Set();

    return Array.from(document.querySelectorAll('[data-review-region], .review-card')).map((node) => {
        const review = node.hasAttribute('data-review-region')
            ? parseDeepDiveReviewNode(node)
            : parseReviewCardNode(node);
        if (!review) return null;

        const key = review.reviewId || `${review.reviewer}|${review.text}|${review.date}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return review;
    }).filter(Boolean);
}

function isDuplicateReview(review, existingReviews) {
    if (review.reviewId) {
        return existingReviews.some((existing) => existing.reviewId === review.reviewId);
    }

    return existingReviews.some((existing) =>
        existing.reviewer === review.reviewer &&
        existing.text === review.text &&
        existing.date === review.date
    );
}

function findNextReviewPageButton() {
    const selectors = [
        'nav[aria-label*="Pagination"] a[rel="next"]:not([aria-disabled="true"])',
        '[data-clg-id="WtPagination"] a[aria-label*="Next"]:not([aria-disabled="true"])',
        'a.wt-pagination__item--next:not([aria-disabled="true"])',
        'a[aria-label="Next page"]:not([aria-disabled="true"])'
    ];

    for (const selector of selectors) {
        const button = document.querySelector(selector);
        if (button) return button;
    }

    const pageLinks = Array.from(document.querySelectorAll('a[href*="page="]'));
    const current = new URLSearchParams(window.location.search).get('page') || '1';
    const nextPage = String(parseInt(current, 10) + 1);
    return pageLinks.find((link) => link.getAttribute('href')?.includes(`page=${nextPage}`)) || null;
}

async function ensureReviewsSectionVisible() {
    const selectors = [
        'button[aria-controls*="review"]',
        'a[href*="#reviews"]',
        '[data-reviews-tab]',
        '#reviews-tab',
        'button[id*="reviews"]'
    ];

    for (const selector of selectors) {
        const tab = document.querySelector(selector);
        if (tab) {
            tab.click();
            await sleep(800);
            break;
        }
    }

    const reviewsAnchor = document.getElementById('reviews') ||
        document.querySelector('[data-region="reviews"], [data-reviews-region]');
    reviewsAnchor?.scrollIntoView({ behavior: 'auto', block: 'start' });
    await sleep(500);
}

let domFallbackAborted = false;

async function fetchReviewsDomFallback({ isProUser = false, freeLimit = 50, delayMin = 1, delayMax = 3 } = {}) {
    domFallbackAborted = false;
    const data = collectEtsyData();
    if (!data.listingId || !data.shopId) {
        throw new Error('Missing listing or shop ID on this page');
    }

    await ensureReviewsSectionVisible();

    const allReviews = [];
    let stagnantRounds = 0;
    let round = 0;

    while (stagnantRounds < 2 && round < 200) {
        if (domFallbackAborted) {
            break;
        }

        if (!isProUser && allReviews.length >= freeLimit) {
            break;
        }

        round += 1;
        const pageReviews = parseReviewsFromDocument();
        let addedCount = 0;

        for (const review of pageReviews) {
            if (!isProUser && allReviews.length >= freeLimit) {
                break;
            }

            if (!isDuplicateReview(review, allReviews)) {
                allReviews.push(review);
                addedCount += 1;
            }
        }

        if (addedCount === 0) {
            stagnantRounds += 1;
        } else {
            stagnantRounds = 0;
        }

        const nextButton = findNextReviewPageButton();
        if (!nextButton) {
            break;
        }

        nextButton.click();
        const delayMs = (delayMin + Math.random() * (delayMax - delayMin)) * 1000;
        const step = 200;
        let elapsed = 0;
        while (elapsed < delayMs) {
            if (domFallbackAborted) {
                break;
            }
            const wait = Math.min(step, delayMs - elapsed);
            await sleep(wait);
            elapsed += wait;
        }
    }

    return {
        listingId: data.listingId,
        shopId: data.shopId,
        reviews: allReviews,
        cancelled: domFallbackAborted
    };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'subscriptionActive') {
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'collectEtsyData') {
        const data = collectEtsyData();
        if (data.listingId && data.shopId) {
            publishEtsyData();
        }
        sendResponse(data);
        return false;
    }

    if (request.action === 'abortDomFallback') {
        domFallbackAborted = true;
        sendResponse({ success: true });
        return false;
    }

    if (request.action === 'fetchReviewsDomFallback') {
        fetchReviewsDomFallback(request)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ error: error.message || 'DOM fallback failed' }));
        return true;
    }

    return false;
});

function startScraping() {
    if (!LISTING_ID_PATTERN.test(window.location.pathname)) {
        console.log('Not a listing page, skipping scrape');
        return;
    }

    waitForEtsyData();
}

if (document.readyState === 'loading') {
    window.addEventListener('load', startScraping);
} else {
    startScraping();
}

let lastPathname = window.location.pathname;
const observer = new MutationObserver(() => {
    if (window.location.pathname !== lastPathname && LISTING_ID_PATTERN.test(window.location.pathname)) {
        lastPathname = window.location.pathname;
        console.log('📍 Listing navigation detected:', window.location.href);
        waitForEtsyData();
    }
});

observer.observe(document.documentElement, { childList: true, subtree: true });

console.log('Content script initialized');

} // end duplicate-injection guard
