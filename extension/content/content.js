// Content Script for Etsy Listing Pages
console.log('🚀 Etsy Review Scraper - Content script loaded');
console.log('📍 Current URL:', window.location.href);

const LISTING_ID_PATTERN = /\/listing\/(\d+)/;

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

function extractShopId() {
    if (window.__etsy_server_data__?.shop_id) {
        return parseInt(String(window.__etsy_server_data__.shop_id), 10);
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

function extractReviewHtml(payload, activeTab = 'listing_reviews') {
    const root = payload?.output?.reviews ?? payload?.output;
    if (!root) return '';

    if (typeof root === 'string') {
        return root;
    }

    if (typeof root === 'object') {
        const preferredKeys = [
            activeTab,
            'shop_reviews',
            'listing_reviews',
            'reviews',
            'html',
            'body',
            'content',
            'markup'
        ];

        for (const key of preferredKeys) {
            const value = root[key];
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }

        for (const value of Object.values(root)) {
            if (typeof value === 'string' && value.includes('review-card')) {
                return value;
            }
        }
    }

    return '';
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

    if (!text && rating === 0) {
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

function parseDeepDiveReviewsFromRoot(root) {
    if (!root) return [];

    const container = root.querySelector?.('[data-deep-dive-reviews-container="true"]') || root;
    const reviewNodes = container.querySelectorAll?.('[data-review-region]') || [];
    const seen = new Set();

    return Array.from(reviewNodes).map((node) => {
        const review = parseDeepDiveReviewNode(node);
        if (!review) return null;

        const key = review.reviewId || `${review.reviewer}|${review.text}|${review.date}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return review;
    }).filter(Boolean);
}

function parseDeepDiveReviewsFromDocument() {
    return parseDeepDiveReviewsFromRoot(document);
}

function parseReviewsFromHtml(htmlString) {
    if (!htmlString?.trim()) return [];

    const doc = new DOMParser().parseFromString(htmlString, 'text/html');
    const deepDiveReviews = parseDeepDiveReviewsFromRoot(doc);
    if (deepDiveReviews.length > 0) {
        return deepDiveReviews;
    }

    let reviewNodes = doc.querySelectorAll('.review-card');

    if (reviewNodes.length === 0) {
        const ratingInputs = doc.querySelectorAll('input[name="rating"]');
        reviewNodes = Array.from(ratingInputs)
            .map((input) => input.closest('.review-card, [data-review-card], [data-review-id], li, article'))
            .filter(Boolean);
    }

    const seen = new Set();

    return Array.from(reviewNodes).map((node) => {
        const reviewer = node.querySelector(
            'a.wt-text-link-no-underline.wt-text-title-small, [data-reviewer-name], .shop2-review-byline a, .wt-text-caption a'
        )?.textContent?.trim() || 'Anonymous';

        const ratingValue = node.querySelector('input[name="rating"]')?.value ||
            node.querySelector('[aria-label*="out of 5"]')?.getAttribute('aria-label')?.match(/(\d)/)?.[1] ||
            node.querySelector('[aria-label*="star"]')?.getAttribute('aria-label')?.match(/(\d)/)?.[1] ||
            '0';

        const text = node.querySelector(
            '.wt-text-body, [data-review-text], .prose, p[data-review-text], .wt-break-word'
        )?.textContent?.trim() || '';

        const itemLinkEl = node.querySelector('a[data-review-link], [data-review-listing], .wt-text-truncate a, a[href*="/listing/"]');
        const item = itemLinkEl?.textContent?.trim() || '';
        const itemUrl = itemLinkEl?.getAttribute('href') || '';
        const itemListingId = itemUrl.match(/\/listing\/(\d+)/)?.[1];
        const dateRaw = node.querySelector('.wt-text-body-small, [data-review-date], time, .wt-text-caption')?.textContent?.trim() || '';

        const key = `${reviewer}|${text}|${dateRaw}`;
        if (seen.has(key)) {
            return null;
        }
        seen.add(key);

        return {
            reviewer,
            rating: parseInt(ratingValue, 10) || 0,
            text,
            item,
            itemUrl,
            listingId: itemListingId ? parseInt(itemListingId, 10) : null,
            date: formatReviewDate(dateRaw)
        };
    }).filter((review) => review && (review.text || review.rating > 0));
}

function parseReviewsFromDocument() {
    const deepDiveReviews = parseDeepDiveReviewsFromDocument();
    if (deepDiveReviews.length > 0) {
        return deepDiveReviews;
    }
    return parseReviewsFromHtml(document.documentElement.outerHTML);
}

function findShowAllReviewsButton() {
    for (const button of document.querySelectorAll('button[data-clg-id="WtButton"]')) {
        if (/^show all$/i.test(button.textContent.trim())) {
            return button;
        }
    }

    return Array.from(document.querySelectorAll('button.wt-btn--secondary.wt-btn--small'))
        .find((button) => /show all/i.test(button.textContent.trim())) || null;
}

function findNextDeepDivePageButton() {
    for (const button of document.querySelectorAll('button.wt-action-group__item')) {
        const label = button.querySelector('.wt-screen-reader-only')?.textContent?.trim();
        if (label === 'Next' && button.getAttribute('aria-disabled') !== 'true' && !button.disabled) {
            return button;
        }
    }

    return null;
}

async function waitForDeepDiveReviewsContainer(maxWaitMs = 15000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
        const container = document.querySelector('[data-deep-dive-reviews-container="true"]');
        if (container?.querySelector('[data-review-region]')) {
            return container;
        }
        await sleep(300);
    }

    return null;
}

async function openDeepDiveReviewsPanel() {
    await ensureReviewsSectionVisible();

    const existingContainer = document.querySelector('[data-deep-dive-reviews-container="true"]');
    if (existingContainer?.querySelector('[data-review-region]')) {
        console.log('📍 Deep dive reviews panel already open');
        return existingContainer;
    }

    const showAllButton = findShowAllReviewsButton();
    if (!showAllButton) {
        throw new Error('Could not find the "Show all" reviews button. Scroll to Reviews and try again.');
    }

    console.log('🖱️ Clicking "Show all" reviews button');
    showAllButton.scrollIntoView({ behavior: 'auto', block: 'center' });
    showAllButton.click();

    const container = await waitForDeepDiveReviewsContainer();
    if (!container) {
        throw new Error('Reviews panel did not open after clicking "Show all".');
    }

    return container;
}

function getListingReviewsUrl(data, page) {
    const suffix = page > 1 ? `?page=${page}` : '';
    return `https://www.etsy.com/listing/${data.listingId}/reviews${suffix}`;
}

function extractPaginationInfo(html, currentPage) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const nextLink = doc.querySelector(
        'nav[aria-label*="Pagination"] a[rel="next"], ' +
        '[data-clg-id="WtPagination"] a[aria-label*="Next"], ' +
        'a.wt-pagination__item--next, ' +
        'a[aria-label="Next page"]'
    );
    if (nextLink && nextLink.getAttribute('aria-disabled') !== 'true') {
        return { hasMore: true };
    }

    let maxPage = currentPage;
    doc.querySelectorAll('a[href*="page="]').forEach((anchor) => {
        const match = (anchor.getAttribute('href') || '').match(/[?&]page=(\d+)/);
        if (match) {
            maxPage = Math.max(maxPage, parseInt(match[1], 10));
        }
    });

    if (maxPage > currentPage) {
        return { hasMore: true };
    }

    const pageText = doc.body?.textContent || '';
    const totalMatch = pageText.match(/(\d+)\s*results?,?\s*page\s*(\d+)\s*of\s*(\d+)/i) ||
        pageText.match(/page\s*(\d+)\s*of\s*(\d+)/i);
    if (totalMatch) {
        const current = parseInt(totalMatch[totalMatch.length - 2], 10);
        const total = parseInt(totalMatch[totalMatch.length - 1], 10);
        if (!Number.isNaN(current) && !Number.isNaN(total)) {
            return { hasMore: current < total };
        }
    }

    return { hasMore: null };
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

async function activateListingReviewsContext(data) {
    await ensureReviewsSectionVisible();

    if (window.location.pathname.includes('/reviews')) {
        data.reviewsPageUrl = window.location.href.split('?')[0];
        console.log('📍 Already on listing reviews page');
        return data.reviewsPageUrl;
    }

    const viewAll = findViewAllReviewsElement();
    if (!viewAll) {
        data.reviewsPageUrl = getListingReviewsUrl(data, 1);
        console.log('ℹ️ "View all reviews" not found, using', data.reviewsPageUrl);
        return data.reviewsPageUrl;
    }

    const link = viewAll.tagName === 'A' ? viewAll : viewAll.closest('a');
    const href = link?.getAttribute('href');

    if (href?.includes('/reviews')) {
        data.reviewsPageUrl = new URL(href, window.location.origin).href.split('?')[0];
        console.log('📍 Found listing reviews URL from button:', data.reviewsPageUrl);
    } else {
        console.log('🖱️ Clicking "View all reviews for this item"');
        viewAll.click();
        await sleep(2000);

        if (window.location.pathname.includes('/reviews')) {
            data.reviewsPageUrl = window.location.href.split('?')[0];
        } else {
            data.reviewsPageUrl = getListingReviewsUrl(data, 1);
        }
    }

    try {
        await fetch(getListingReviewsUrl(data, 1), {
            method: 'GET',
            credentials: 'include',
            headers: {
                accept: 'text/html,application/xhtml+xml',
                referer: data.listingUrl || `https://www.etsy.com/listing/${data.listingId}`
            }
        });
    } catch {
        // warm-up is best-effort
    }

    return data.reviewsPageUrl;
}

function filterReviewsForListing(reviews, listingId) {
    if (!listingId) return reviews;
    return reviews.filter((review) => {
        if (review.listingId) {
            return review.listingId === listingId;
        }
        if (review.itemUrl) {
            return review.itemUrl.includes(`/listing/${listingId}`);
        }
        return true;
    });
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

function getListingReferer(listingId) {
    return `https://www.etsy.com/listing/${listingId}`;
}

async function refreshCsrfToken(data) {
    const pageToken = extractCsrfToken();
    if (pageToken) {
        data.csrfToken = pageToken;
        return pageToken;
    }

    try {
        const response = await fetch('https://www.etsy.com/', {
            credentials: 'include',
            headers: { accept: 'text/html' }
        });
        if (!response.ok) {
            return data.csrfToken || null;
        }

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const token = doc.querySelector('meta[name="csrf_nonce"]')?.content ||
            doc.querySelector('meta[name="x-csrf-token"]')?.content ||
            null;

        if (token) {
            data.csrfToken = token;
        }
        return token;
    } catch {
        return data.csrfToken || null;
    }
}

function buildEtsyApiHeaders(data, listingId) {
    return {
        'Content-Type': 'application/json',
        'x-csrf-token': data.csrfToken,
        'x-requested-with': 'XMLHttpRequest',
        accept: '*/*',
        referer: getListingReferer(listingId)
    };
}

function buildReviewRequestBody(data, page, activeTab) {
    return {
        log_performance_metrics: true,
        specs: {
            reviews: [
                'Etsy\\Modules\\ListingPage\\Reviews\\DataComposer',
                {
                    listing_id: Number(data.listingId),
                    shop_id: Number(data.shopId),
                    render_complete: true,
                    active_tab: activeTab,
                    should_lazy_load_images: true,
                    should_use_pagination: true,
                    page,
                    should_show_variations: false,
                    is_reviews_untabbed_cached: false,
                    was_landing_from_external_referrer: !!data.isExternalReferrer,
                    sort_option: 'Relevancy'
                }
            ]
        },
        runtime_analysis: false
    };
}

async function fetchReviewsViaApi(data, page, activeTab) {
    await refreshCsrfToken(data);
    if (!data.csrfToken) {
        throw new Error('Could not find CSRF token. Please refresh the Etsy listing page.');
    }

    const response = await fetch('https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/reviews', {
        method: 'POST',
        headers: buildEtsyApiHeaders(data, data.listingId),
        credentials: 'include',
        body: JSON.stringify(buildReviewRequestBody(data, page, activeTab))
    });

    if (response.status === 429) {
        throw new Error('Rate limit reached. Please wait and try again.');
    }

    if (!response.ok) {
        throw new Error(`Etsy API error: ${response.status}`);
    }

    const payload = await response.json();
    const htmlString = typeof payload?.output?.reviews === 'string'
        ? payload.output.reviews
        : extractReviewHtml(payload, activeTab);
    const reviews = parseReviewsFromHtml(htmlString);
    const hasMore = extractHasMoreReviews(payload, reviews.length);

    return { reviews, hasMore, htmlEmpty: !htmlString.trim(), activeTab };
}

function extractHasMoreReviews(payload, reviewCount) {
    const root = payload?.output?.reviews;
    if (root && typeof root === 'object') {
        if (root.has_more === false || root.has_more_reviews === false) {
            return false;
        }
        if (root.has_more === true || root.has_more_reviews === true) {
            return true;
        }
        if (typeof root.total_pages === 'number' && typeof root.page === 'number') {
            return root.page < root.total_pages;
        }
    }

    // Unknown — caller decides based on whether new reviews were added
    return reviewCount > 0 ? null : false;
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

async function waitForNewDeepDiveReviews(previousIds, maxWaitMs = 10000) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
        const currentReviews = parseDeepDiveReviewsFromDocument();
        const hasNewReview = currentReviews.some((review) => review.reviewId && !previousIds.has(review.reviewId));
        if (hasNewReview) {
            return true;
        }
        await sleep(300);
    }

    return false;
}

function collectReviewIds(reviews) {
    return new Set(reviews.map((review) => review.reviewId).filter(Boolean));
}

const DEEP_DIVE_REVIEWS_API = 'https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/deep_dive_reviews';
const DEEP_DIVE_REVIEW_SCOPE = 'shopReviews';

function buildDeepDiveReviewRequestBody(data, page) {
    return {
        log_performance_metrics: true,
        specs: {
            deep_dive_reviews: [
                'Etsy\\Modules\\ListingPage\\Reviews\\DeepDive\\AsyncApiSpec',
                {
                    listing_id: Number(data.listingId),
                    shop_id: Number(data.shopId),
                    scope: DEEP_DIVE_REVIEW_SCOPE,
                    page,
                    sort_option: 'Relevancy',
                    rating_filter: null,
                    tag_filters: [],
                    review_highlight_transaction_id: null,
                    should_lazy_load_images: false,
                    should_show_variations: true,
                    photo_aesthetics_ranking_dataset_version: 'v1'
                }
            ]
        },
        runtime_analysis: false
    };
}

function extractDeepDiveReviewHtml(payload) {
    const root = payload?.output?.deep_dive_reviews ?? payload?.output;
    if (!root) return '';

    if (typeof root === 'string') {
        return root;
    }

    if (typeof root === 'object') {
        const preferredKeys = [
            'deep_dive_reviews',
            'html',
            'body',
            'content',
            'markup',
            'reviews'
        ];

        for (const key of preferredKeys) {
            const value = root[key];
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }

        for (const value of Object.values(root)) {
            if (typeof value === 'string' && value.includes('data-review-region')) {
                return value;
            }
        }
    }

    return '';
}

function extractDeepDiveHasMore(payload, reviewCount) {
    const root = payload?.output?.deep_dive_reviews;
    if (root && typeof root === 'object') {
        if (root.has_more === false || root.has_more_reviews === false) {
            return false;
        }
        if (root.has_more === true || root.has_more_reviews === true) {
            return true;
        }
        if (typeof root.total_pages === 'number' && typeof root.page === 'number') {
            return root.page < root.total_pages;
        }
    }

    return reviewCount > 0 ? null : false;
}

async function fetchDeepDiveReviewsViaApi(data, page) {
    await refreshCsrfToken(data);
    if (!data.csrfToken) {
        throw new Error('Could not find CSRF token. Please refresh the Etsy listing page.');
    }

    const response = await fetch(DEEP_DIVE_REVIEWS_API, {
        method: 'POST',
        headers: buildEtsyApiHeaders(data, data.listingId),
        credentials: 'include',
        body: JSON.stringify(buildDeepDiveReviewRequestBody(data, page))
    });

    if (response.status === 429) {
        throw new Error('Rate limit reached. Please wait and try again.');
    }

    if (!response.ok) {
        throw new Error(`Etsy deep dive API error: ${response.status}`);
    }

    const payload = await response.json();
    const htmlString = typeof payload?.output?.deep_dive_reviews === 'string'
        ? payload.output.deep_dive_reviews
        : extractDeepDiveReviewHtml(payload);
    const reviews = parseReviewsFromHtml(htmlString);
    const hasMore = extractDeepDiveHasMore(payload, reviews.length);

    return { reviews, hasMore, htmlEmpty: !htmlString.trim() };
}

async function fetchReviewsViaDeepDiveDom({ isProUser, freeLimit, delayMin, delayMax, onProgress }) {
    const allReviews = [];
    let page = 1;
    let stagnantRounds = 0;

    while (stagnantRounds < 2 && page <= 500) {
        const pageReviews = parseDeepDiveReviewsFromDocument();
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

        console.log(`✅ Deep dive DOM page ${page}: ${pageReviews.length} visible, ${addedCount} new`);

        if (onProgress) {
            onProgress(allReviews, page);
        }

        if (!isProUser && allReviews.length >= freeLimit) {
            break;
        }

        const nextButton = findNextDeepDivePageButton();
        if (!nextButton) {
            break;
        }

        if (addedCount === 0) {
            stagnantRounds += 1;
        } else {
            stagnantRounds = 0;
        }

        const previousIds = collectReviewIds(allReviews);
        nextButton.scrollIntoView({ behavior: 'auto', block: 'center' });
        nextButton.click();

        const loaded = await waitForNewDeepDiveReviews(previousIds);
        if (!loaded && stagnantRounds >= 1) {
            break;
        }

        page += 1;
        await sleep((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
    }

    return allReviews;
}

async function fetchReviewsViaDeepDivePanel(data, { isProUser, freeLimit, delayMin, delayMax, onProgress }) {
    if (!data.csrfToken) {
        throw new Error('Could not find CSRF token. Please refresh the Etsy listing page.');
    }

    try {
        await openDeepDiveReviewsPanel();
    } catch (error) {
        console.warn('Show all click failed, continuing with deep dive API:', error.message);
    }

    const allReviews = [];
    let page = 1;
    let duplicatePages = 0;

    while (page <= 500) {
        const result = await fetchDeepDiveReviewsViaApi(data, page);
        const pageReviews = result.reviews;

        if (pageReviews.length === 0) {
            break;
        }

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

        console.log(`✅ Deep dive API page ${page}: ${pageReviews.length} fetched, ${addedCount} new (total ${allReviews.length})`);

        if (onProgress) {
            onProgress(allReviews, page);
        }

        if (!isProUser && allReviews.length >= freeLimit) {
            break;
        }

        if (addedCount === 0) {
            duplicatePages += 1;
            if (duplicatePages >= 2) {
                break;
            }
        } else {
            duplicatePages = 0;
        }

        if (result.hasMore === false) {
            console.log(`⏹️ Deep dive API: no more pages after page ${page}`);
            break;
        }

        page += 1;
        await sleep((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
    }

    if (allReviews.length > 0) {
        return allReviews;
    }

    console.warn('Deep dive API returned no reviews, falling back to DOM pagination');
    return fetchReviewsViaDeepDiveDom({ isProUser, freeLimit, delayMin, delayMax, onProgress });
}

async function fetchReviewPage(data, page, preferredTab) {
    const apiTabs = preferredTab ? [preferredTab] : ['shop_reviews', 'listing_reviews'];

    for (const activeTab of apiTabs) {
        const apiResult = await fetchReviewsViaApi(data, page, activeTab);
        let reviews = apiResult.reviews;

        if (activeTab === 'shop_reviews') {
            reviews = filterReviewsForListing(reviews, data.listingId);
        }

        if (reviews.length > 0) {
            console.log(`✅ Got ${reviews.length} reviews via API (${activeTab}, page ${page})`);
            return {
                reviews,
                hasMore: apiResult.hasMore,
                activeTab
            };
        }
    }

    if (page === 1) {
        const htmlResult = await fetchReviewsViaListingPage(data, page);
        if (htmlResult.reviews.length > 0) {
            console.log(`✅ Got ${htmlResult.reviews.length} reviews via /reviews HTML page ${page}`);
            return {
                reviews: htmlResult.reviews,
                hasMore: htmlResult.hasMore,
                activeTab: preferredTab
            };
        }

        const domReviews = parseReviewsFromDocument();
        if (domReviews.length > 0) {
            console.log(`✅ Got ${domReviews.length} reviews from page DOM`);
            return {
                reviews: domReviews,
                hasMore: null,
                activeTab: preferredTab
            };
        }
    }

    return { reviews: [], hasMore: false, activeTab: preferredTab };
}

async function fetchReviewsViaDomPagination(data, allReviews, { isProUser, freeLimit, onProgress } = {}) {
    if (!window.location.pathname.includes('/reviews')) {
        return allReviews;
    }

    let stagnantRounds = 0;
    let round = 0;

    while (stagnantRounds < 2 && round < 200) {
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

        if (onProgress) {
            onProgress(allReviews.length, round);
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
        await sleep(1800);
    }

    return allReviews;
}

async function fetchReviewsViaListingPage(data, page) {
    const url = getListingReviewsUrl(data, page);
    const referer = page > 1
        ? getListingReviewsUrl(data, page - 1)
        : (data.listingUrl || getListingReviewsUrl(data, 1));

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            accept: 'text/html,application/xhtml+xml',
            'x-requested-with': 'XMLHttpRequest',
            referer
        },
        credentials: 'include'
    });

    if (!response.ok) {
        return { reviews: [], hasMore: false, htmlEmpty: true };
    }

    const html = await response.text();
    const reviews = parseReviewsFromHtml(html);
    const pagination = extractPaginationInfo(html, page);

    return {
        reviews,
        hasMore: pagination.hasMore ?? (reviews.length > 0 ? null : false),
        htmlEmpty: !html.trim()
    };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchReviewsFromPage({ isProUser = false, freeLimit = 50, delayMin = 1, delayMax = 3 } = {}) {
    const data = collectEtsyData();

    if (!data.listingId || !data.shopId) {
        throw new Error('Missing listing or shop ID on this page');
    }

    publishEtsyData();

    const sendProgress = (reviews, page) => {
        chrome.runtime.sendMessage({
            type: 'reviewProgress',
            listingId: data.listingId,
            shopId: data.shopId,
            page,
            total: reviews.length,
            reviews,
            limitReached: !isProUser && reviews.length >= freeLimit
        });
    };

    let allReviews = [];

    try {
        allReviews = await fetchReviewsViaDeepDivePanel(data, {
            isProUser,
            freeLimit,
            delayMin,
            delayMax,
            onProgress: sendProgress
        });
    } catch (deepDiveError) {
        console.warn('Deep dive review fetch failed, trying API fallback:', deepDiveError.message);

        if (!data.csrfToken) {
            throw deepDiveError;
        }

        let page = 1;
        let preferredTab = null;
        let duplicatePages = 0;
        let hasMore = true;

        while (hasMore) {
            const result = await fetchReviewPage(data, page, preferredTab);
            const pageReviews = result.reviews;

            if (pageReviews.length === 0) {
                break;
            }

            if (result.activeTab) {
                preferredTab = result.activeTab;
            }

            let addedCount = 0;
            for (const review of pageReviews) {
                if (!isProUser && allReviews.length >= freeLimit) {
                    hasMore = false;
                    break;
                }

                if (!isDuplicateReview(review, allReviews)) {
                    allReviews.push(review);
                    addedCount += 1;
                }
            }

            sendProgress(allReviews, page);

            if (!hasMore || (!isProUser && allReviews.length >= freeLimit)) {
                break;
            }

            if (addedCount === 0) {
                duplicatePages += 1;
                if (duplicatePages >= 2) break;
            } else {
                duplicatePages = 0;
            }

            if (result.hasMore === false) {
                break;
            }

            page += 1;
            await sleep((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
        }

        if (allReviews.length === 0) {
            throw deepDiveError;
        }
    }

    if (allReviews.length === 0) {
        throw new Error('No reviews found. Open the listing Reviews section and try again.');
    }

    return {
        listingId: data.listingId,
        shopId: data.shopId,
        reviews: allReviews,
        limitReached: !isProUser && allReviews.length >= freeLimit
    };
}

let activeFetchPromise = null;

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

    if (request.action === 'startReviewFetch') {
        if (activeFetchPromise) {
            sendResponse({ error: 'Review fetch already in progress on this tab' });
            return false;
        }

        activeFetchPromise = fetchReviewsFromPage(request)
            .then((result) => {
                chrome.runtime.sendMessage({ type: 'reviewComplete', ...result });
                sendResponse({ success: true, ...result });
            })
            .catch((error) => {
                chrome.runtime.sendMessage({
                    type: 'reviewError',
                    message: error.message || 'Failed to fetch reviews'
                });
                sendResponse({ error: error.message || 'Failed to fetch reviews' });
            })
            .finally(() => {
                activeFetchPromise = null;
            });

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
