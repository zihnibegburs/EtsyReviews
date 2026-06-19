// Shared Etsy review fetching — runs in the background service worker.

const DEEP_DIVE_REVIEWS_API = 'https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/deep_dive_reviews';
const REVIEWS_API = 'https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/reviews';
const DEEP_DIVE_REVIEW_SCOPE = 'shopReviews';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function parseJsDataReview(entry) {
    const reviewInfo = entry?.reviewInfo || {};
    const buyerInfo = entry?.buyerInfo || {};
    const reviewContent = entry?.reviewContent || {};
    const transactionData = reviewInfo.transactionData || {};
    const itemUrl = transactionData.listingUrl || '';
    const listingIdMatch = itemUrl.match(/\/listing\/(\d+)/);
    const transactionId = entry?.transactionId;

    const review = {
        reviewId: transactionId != null ? String(transactionId) : null,
        reviewer: buyerInfo.name || 'Anonymous',
        rating: reviewInfo.rating || 0,
        text: reviewContent.reviewText || '',
        item: transactionData.listingTitle || '',
        itemUrl,
        listingId: listingIdMatch ? parseInt(listingIdMatch[1], 10) : null,
        date: formatReviewDate(reviewInfo.reviewDate || '')
    };

    if (!review.text && !review.rating && !review.reviewId) {
        return null;
    }

    return review;
}

function parseReviewsFromJsData(payload) {
    const reviews = payload?.jsData?.reviews;
    if (!Array.isArray(reviews) || reviews.length === 0) {
        return [];
    }

    return reviews.map(parseJsDataReview).filter(Boolean);
}

function parseReviewsFromPayload(payload, activeTab = null) {
    const jsDataReviews = parseReviewsFromJsData(payload);
    if (jsDataReviews.length > 0) {
        return jsDataReviews;
    }

    const htmlString = extractReviewHtmlFromPayload(payload, activeTab);
    return parseReviewsFromHtml(htmlString);
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

function getListingReferer(listingId) {
    return `https://www.etsy.com/listing/${listingId}`;
}

function getListingReviewsUrl(data, page) {
    const suffix = page > 1 ? `?page=${page}` : '';
    return `https://www.etsy.com/listing/${data.listingId}/reviews${suffix}`;
}

async function refreshCsrfToken(data) {
    if (data.csrfToken) {
        return data.csrfToken;
    }

    try {
        const response = await fetch('https://www.etsy.com/', {
            credentials: 'include',
            headers: { accept: 'text/html' }
        });
        if (!response.ok) {
            return null;
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
        referer: data.listingUrl || getListingReferer(listingId)
    };
}

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

const REVIEW_HTML_MARKERS = ['data-review-region', 'review-card', 'data-review-card'];

function containsReviewHtml(value) {
    return typeof value === 'string' && REVIEW_HTML_MARKERS.some((marker) => value.includes(marker));
}

function extractHtmlFromReviewRoot(root, depth = 0) {
    if (!root || depth > 6) return '';
    if (typeof root === 'string' && root.trim()) return root;
    if (typeof root !== 'object') return '';

    const preferredKeys = [
        'reviews',
        'deep_dive_reviews',
        'listing_reviews',
        'shop_reviews',
        'html',
        'body',
        'content',
        'markup',
        'review_list',
        'review_cards'
    ];

    for (const key of preferredKeys) {
        const value = root[key];
        if (typeof value === 'string' && value.trim()) {
            return value;
        }
        if (value && typeof value === 'object') {
            const nested = extractHtmlFromReviewRoot(value, depth + 1);
            if (nested.trim()) {
                return nested;
            }
        }
    }

    for (const value of Object.values(root)) {
        if (containsReviewHtml(value)) {
            return value;
        }
    }

    for (const value of Object.values(root)) {
        if (value && typeof value === 'object') {
            const nested = extractHtmlFromReviewRoot(value, depth + 1);
            if (nested.trim()) {
                return nested;
            }
        }
    }

    return '';
}

function extractReviewHtmlFromPayload(payload, activeTab = null) {
    const output = payload?.output;
    if (!output) return '';

    if (activeTab && output.reviews && typeof output.reviews === 'object') {
        const tabHtml = extractHtmlFromReviewRoot(output.reviews[activeTab]);
        if (tabHtml.trim()) {
            return tabHtml;
        }
    }

    const roots = [output.reviews, output.deep_dive_reviews, output].filter((root) => root != null);
    for (const root of roots) {
        const html = extractHtmlFromReviewRoot(root);
        if (html.trim()) {
            return html;
        }
    }

    return '';
}

function extractHasMoreFromPayload(payload, reviewCount) {
    const jsData = payload?.jsData;
    if (jsData && typeof jsData.currentPage === 'number' && typeof jsData.totalPages === 'number') {
        return jsData.currentPage < jsData.totalPages;
    }

    const roots = [payload?.output?.reviews, payload?.output?.deep_dive_reviews, payload?.output].filter(Boolean);

    for (const root of roots) {
        if (!root || typeof root !== 'object') continue;

        if (root.has_more === false || root.has_more_reviews === false) {
            return false;
        }

        if (root.has_more === true || root.has_more_reviews === true || root.has_next_page === true) {
            return true;
        }

        if (typeof root.total_pages === 'number' && typeof root.page === 'number') {
            return root.page < root.total_pages;
        }

        if (root.pagination && typeof root.pagination === 'object') {
            if (root.pagination.has_more === true || root.pagination.has_next === true) {
                return true;
            }
            if (root.pagination.has_more === false || root.pagination.has_next === false) {
                return false;
            }
        }
    }

    return reviewCount > 0 ? null : false;
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

async function fetchDeepDiveReviewsViaApi(data, page) {
    await refreshCsrfToken(data);
    if (!data.csrfToken) {
        throw new Error('Could not find CSRF token. Please refresh the Etsy listing page.');
    }

    const requestBody = buildDeepDiveReviewRequestBody(data, page);
    const response = await fetch(DEEP_DIVE_REVIEWS_API, {
        method: 'POST',
        headers: buildEtsyApiHeaders(data, data.listingId),
        credentials: 'include',
        body: JSON.stringify(requestBody)
    });

    if (response.status === 429) {
        throw new Error('Rate limit reached. Please wait and try again.');
    }

    if (!response.ok) {
        throw new Error(`Etsy deep dive API error: ${response.status}`);
    }

    const payload = await response.json();
    const reviews = parseReviewsFromPayload(payload);
    const hasMore = extractHasMoreFromPayload(payload, reviews.length);

    return { reviews, hasMore, htmlEmpty: reviews.length === 0 };
}

async function fetchReviewsViaApi(data, page, activeTab) {
    await refreshCsrfToken(data);
    if (!data.csrfToken) {
        throw new Error('Could not find CSRF token. Please refresh the Etsy listing page.');
    }

    const response = await fetch(REVIEWS_API, {
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
    const reviews = parseReviewsFromPayload(payload, activeTab);
    const hasMore = extractHasMoreFromPayload(payload, reviews.length);

    return { reviews, hasMore, htmlEmpty: reviews.length === 0, activeTab };
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

async function fetchReviewPage(data, page, preferredTab) {
    const apiTabs = preferredTab ? [preferredTab] : ['shop_reviews', 'listing_reviews'];

    for (const activeTab of apiTabs) {
        const apiResult = await fetchReviewsViaApi(data, page, activeTab);
        let reviews = apiResult.reviews;

        if (activeTab === 'shop_reviews') {
            reviews = filterReviewsForListing(reviews, data.listingId);
        }

        if (reviews.length > 0) {
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
            return {
                reviews: htmlResult.reviews,
                hasMore: htmlResult.hasMore,
                activeTab: preferredTab
            };
        }
    }

    return { reviews: [], hasMore: false, activeTab: preferredTab };
}

function addPageReviews(allReviews, pageReviews, { isProUser, freeLimit }) {
    let addedCount = 0;

    for (const review of pageReviews) {
        if (!isProUser && allReviews.length >= freeLimit) {
            return { addedCount, limitReached: true };
        }

        if (!isDuplicateReview(review, allReviews)) {
            allReviews.push(review);
            addedCount += 1;
        }
    }

    return { addedCount, limitReached: !isProUser && allReviews.length >= freeLimit };
}

async function fetchViaDeepDiveApi(data, { isProUser, freeLimit, delayMin, delayMax, onProgress }) {
    const allReviews = [];
    let page = 1;
    let duplicatePages = 0;

    while (page <= 500) {
        const result = await fetchDeepDiveReviewsViaApi(data, page);
        const pageReviews = result.reviews;

        if (pageReviews.length === 0) {
            break;
        }

        const { addedCount, limitReached } = addPageReviews(allReviews, pageReviews, { isProUser, freeLimit });

        if (onProgress) {
            onProgress(allReviews, page);
        }

        if (limitReached) {
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
            break;
        }

        page += 1;
        await sleep((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
    }

    return allReviews;
}

async function fetchViaReviewsApi(data, { isProUser, freeLimit, delayMin, delayMax, onProgress }) {
    const allReviews = [];
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

        const { addedCount, limitReached } = addPageReviews(allReviews, pageReviews, { isProUser, freeLimit });

        if (onProgress) {
            onProgress(allReviews, page);
        }

        if (limitReached) {
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
            break;
        }

        page += 1;
        await sleep((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
    }

    return allReviews;
}

async function fetchViaListingHtml(data, { isProUser, freeLimit, delayMin, delayMax, onProgress }) {
    const allReviews = [];
    let page = 1;
    let duplicatePages = 0;
    let hasMore = true;

    while (hasMore && page <= 500) {
        const result = await fetchReviewsViaListingPage(data, page);
        const pageReviews = result.reviews;

        if (pageReviews.length === 0) {
            break;
        }

        const { addedCount, limitReached } = addPageReviews(allReviews, pageReviews, { isProUser, freeLimit });

        if (onProgress) {
            onProgress(allReviews, page);
        }

        if (limitReached) {
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
            break;
        }

        page += 1;
        await sleep((delayMin + Math.random() * (delayMax - delayMin)) * 1000);
    }

    return allReviews;
}

async function fetchAllReviews(data, options = {}) {
    const {
        isProUser = false,
        freeLimit = 50,
        delayMin = 1,
        delayMax = 3,
        onProgress = null
    } = options;

    if (!data?.listingId || !data?.shopId) {
        throw new Error('Missing listing or shop ID. Open an Etsy listing page and try again.');
    }

    await refreshCsrfToken(data);
    if (!data.csrfToken) {
        throw new Error('Could not find CSRF token. Please refresh the Etsy listing page.');
    }

    let allReviews = await fetchViaDeepDiveApi(data, { isProUser, freeLimit, delayMin, delayMax, onProgress });

    if (allReviews.length === 0) {
        allReviews = await fetchViaReviewsApi(data, { isProUser, freeLimit, delayMin, delayMax, onProgress });
    }

    if (allReviews.length === 0) {
        allReviews = await fetchViaListingHtml(data, { isProUser, freeLimit, delayMin, delayMax, onProgress });
    }

    if (allReviews.length === 0) {
        throw new Error('No reviews found for this listing.');
    }

    return {
        listingId: data.listingId,
        shopId: data.shopId,
        reviews: allReviews,
        limitReached: !isProUser && allReviews.length >= freeLimit
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.ReviewFetcher = {
        fetchAllReviews,
        refreshCsrfToken
    };
}
