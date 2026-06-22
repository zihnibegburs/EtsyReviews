// Output page - Review fetching and display

const REVIEWS_PER_PAGE = 10;
const FREE_USER_REVIEW_LIMIT = 50;
let allReviews = [];
let currentPage = 1;
let ratingFilter = null;
let isProUser = false;
let isFetching = false;
let currentTabId = null;
let fetchFinished = false;
let stopRequested = false;

function openCheckout() {
    chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
}

function updatePremiumButton() {
    const premiumBtn = document.getElementById('premiumBtn');
    if (!premiumBtn) return;
    premiumBtn.style.display = isProUser ? 'none' : 'inline-block';
}

document.getElementById('premiumBtn')?.addEventListener('click', openCheckout);

const VALID_REVIEW_SCOPES = new Set(['listingReviews', 'shopReviews']);
const VALID_SORT_OPTIONS = new Set(['Recency', 'Relevancy', 'Highest', 'Lowest']);

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const tabId = parseInt(params.get('tabId'), 10);
    const reviewScope = params.get('reviewScope') || 'shopReviews';
    const sortOption = params.get('sortOption') || 'Relevancy';

    return {
        tabId: Number.isNaN(tabId) ? null : tabId,
        reviewScope: VALID_REVIEW_SCOPES.has(reviewScope) ? reviewScope : 'shopReviews',
        sortOption: VALID_SORT_OPTIONS.has(sortOption) ? sortOption : 'Relevancy'
    };
}

function getTabIdFromUrl() {
    return getUrlParams().tabId;
}

function formatPercent(value) {
    if (value == null) return '-';
    return `${value.toFixed(1)}%`;
}

function formatStatNumber(value, decimals = 1) {
    if (value == null) return '-';
    return Number(value).toFixed(decimals);
}

function getFilteredReviews() {
    if (!ratingFilter) return allReviews;
    return allReviews.filter((review) => review.rating === ratingFilter);
}

function renderRatingBars(distribution, total) {
    if (!total) {
        return '<p class="analytics-empty">No rating data yet.</p>';
    }

    return [5, 4, 3, 2, 1].map((star) => {
        const count = distribution[star] || 0;
        const width = total ? (count / total) * 100 : 0;
        return `
            <div class="rating-bar-row">
                <span class="rating-bar-label">${star} ★</span>
                <div class="rating-bar-track">
                    <div class="rating-bar-fill" style="width: ${width}%"></div>
                </div>
                <span class="rating-bar-count">${count}</span>
            </div>
        `;
    }).join('');
}

function renderMonthBars(monthlyData) {
    if (!monthlyData.length) {
        return '<p class="analytics-empty">No dated reviews found.</p>';
    }

    const maxCount = Math.max(...monthlyData.map((item) => item.count));

    return monthlyData.map(({ month, count }) => {
        const width = maxCount ? (count / maxCount) * 100 : 0;
        const [year, monthNum] = month.split('-');
        const label = `${monthNum}/${year.slice(2)}`;
        return `
            <div class="month-bar-row">
                <span class="month-bar-label">${label}</span>
                <div class="rating-bar-track">
                    <div class="rating-bar-fill month-bar-fill" style="width: ${width}%"></div>
                </div>
                <span class="rating-bar-count">${count}</span>
            </div>
        `;
    }).join('');
}

function renderKeywordTags(keywords) {
    if (!keywords.length) {
        return '<p class="analytics-empty">Not enough text to extract keywords.</p>';
    }

    return `
        <div class="keyword-tags">
            ${keywords.map(({ word, count }) => `
                <span class="keyword-tag">
                    ${word}
                    <span class="keyword-tag-count">${count}</span>
                </span>
            `).join('')}
        </div>
    `;
}

function renderAnalytics() {
    const analyticsEl = document.getElementById('analytics');
    const statsEl = document.getElementById('analyticsStats');
    if (!analyticsEl || !statsEl) return;

    if (!allReviews.length) {
        analyticsEl.classList.remove('is-visible');
        return;
    }

    analyticsEl.classList.add('is-visible');

    const stats = computeReviewStats(allReviews);
    const monthlyData = getReviewsByMonth(allReviews);
    const keywords = getTopKeywords(allReviews);

    const statCards = [
        { label: 'Collected', value: String(stats.total) },
        { label: 'Avg Rating', value: formatStatNumber(stats.averageRating, 2) },
        { label: 'Positive (4-5★)', value: formatPercent(stats.positiveRate) },
        { label: 'Recommend Rate', value: formatPercent(stats.recommendRate) },
        { label: 'With Text', value: formatPercent(stats.withTextRate) },
        { label: 'With Photo', value: formatPercent(stats.withPhotoRate) },
        { label: 'Avg Words', value: formatStatNumber(stats.averageWordCount, 0) }
    ];

    statsEl.innerHTML = statCards.map(({ label, value }) => `
        <div class="analytics-stat">
            <div class="analytics-stat-label">${label}</div>
            <div class="analytics-stat-value">${value}</div>
        </div>
    `).join('');

    const distributionEl = document.getElementById('ratingDistribution');
    const monthEl = document.getElementById('reviewsByMonth');
    const keywordsEl = document.getElementById('topKeywords');

    if (distributionEl) {
        distributionEl.innerHTML = renderRatingBars(stats.ratingDistribution, stats.total);
    }
    if (monthEl) {
        monthEl.innerHTML = renderMonthBars(monthlyData);
    }
    if (keywordsEl) {
        keywordsEl.innerHTML = renderKeywordTags(keywords);
    }
}

function renderRatingFilters() {
    const filtersEl = document.getElementById('reviewFilters');
    if (!filtersEl) return;

    if (!allReviews.length) {
        filtersEl.classList.add('hidden');
        filtersEl.innerHTML = '';
        return;
    }

    filtersEl.classList.remove('hidden');

    const distribution = computeReviewStats(allReviews).ratingDistribution;
    const chips = [
        { label: 'All', value: null, count: allReviews.length },
        ...[5, 4, 3, 2, 1].map((star) => ({
            label: `${star} ★`,
            value: star,
            count: distribution[star] || 0
        }))
    ];

    filtersEl.innerHTML = chips.map(({ label, value, count }) => `
        <button
            type="button"
            class="filter-chip${ratingFilter === value ? ' active' : ''}"
            data-rating="${value ?? 'all'}"
        >
            ${label} (${count})
        </button>
    `).join('');

    filtersEl.querySelectorAll('.filter-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            const value = chip.dataset.rating;
            ratingFilter = value === 'all' ? null : parseInt(value, 10);
            currentPage = 1;
            renderPage(currentPage);
        });
    });
}

function formatRecommended(value) {
    if (value === true) return 'Yes';
    if (value === false) return 'No';
    return '';
}

function formatRatingCountValue(count) {
    return Number(count).toLocaleString();
}

function renderRatingCounts(counts) {
    const ratingCountsEl = document.getElementById('ratingCounts');
    if (!ratingCountsEl) {
        return;
    }

    if (!counts || typeof counts !== 'object') {
        ratingCountsEl.className = 'rating-counts is-empty';
        ratingCountsEl.textContent = '-';
        return;
    }

    const items = [5, 4, 3, 2, 1]
        .map((star) => {
            const count = counts[String(star)];
            if (count == null) {
                return null;
            }

            return `
                <div class="rating-count-item">
                    <span class="rating-count-stars">${star} stars</span>
                    <span class="rating-count-value">${formatRatingCountValue(count)}</span>
                    <span class="rating-count-label">reviews</span>
                </div>
            `;
        })
        .filter(Boolean)
        .join('');

    if (!items) {
        ratingCountsEl.className = 'rating-counts is-empty';
        ratingCountsEl.textContent = '-';
        return;
    }

    ratingCountsEl.className = 'rating-counts';
    ratingCountsEl.innerHTML = items;
}

function updateJsDataHeader(jsData) {
    const etsyTotalEl = document.getElementById('etsyTotalReviews');
    const averageRatingEl = document.getElementById('averageRating');
    const ratingCountsEl = document.getElementById('ratingCounts');
    if (!etsyTotalEl || !averageRatingEl || !ratingCountsEl) {
        return;
    }

    if (!jsData) {
        etsyTotalEl.textContent = '-';
        averageRatingEl.textContent = '-';
        ratingCountsEl.className = 'rating-counts is-empty';
        ratingCountsEl.textContent = '-';
        return;
    }

    etsyTotalEl.textContent = jsData.totalReviews != null ? String(jsData.totalReviews) : '-';
    averageRatingEl.textContent = jsData.averageRating != null
        ? Number(jsData.averageRating).toFixed(2)
        : '-';
    renderRatingCounts(jsData.ratingCounts);
}

function buildExportContent(review) {
    const text = review.text || '';
    if (!review.photoUrl) {
        return text;
    }
    return text ? `${text}\n[Image: ${review.photoUrl}]` : review.photoUrl;
}

const EXPORT_HEADERS = [
    '#',
    'Transaction ID',
    'Author',
    'Rating',
    'Recommend',
    'Content',
    'Purchased Item',
    'Date'
];

function buildExportRows() {
    const rows = [EXPORT_HEADERS];

    allReviews.forEach((review, index) => {
        rows.push([
            index + 1,
            review.transactionId || review.reviewId || '',
            review.reviewer || '',
            review.rating ?? '',
            formatRecommended(review.isRecommended),
            buildExportContent(review),
            review.item || '',
            review.date || ''
        ]);
    });

    return rows;
}

function getExportFilename(extension) {
    const listingId = document.getElementById('displayListingId').textContent || 'listing';
    return `etsy_reviews_${listingId}_all.${extension}`;
}

function confirmFreeUserExport() {
    if (isProUser || allReviews.length < FREE_USER_REVIEW_LIMIT) {
        return true;
    }

    return confirm(
        `You are exporting all ${allReviews.length} collected reviews (FREE limit: ${FREE_USER_REVIEW_LIMIT}).\n\nUpgrade to PRO for unlimited reviews!\n\nContinue export?`
    );
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
}

function csvEscape(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportReviewsToCSV() {
    const rows = buildExportRows();
    const csvContent = rows
        .map((row) => row.map((cell) => csvEscape(cell)).join(','))
        .join('\n');

    downloadBlob(
        new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
        getExportFilename('csv')
    );
}

function exportReviewsToXLSX() {
    if (typeof XLSX === 'undefined') {
        throw new Error('XLSX library failed to load');
    }

    const worksheet = XLSX.utils.aoa_to_sheet(buildExportRows());
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reviews');
    XLSX.writeFile(workbook, getExportFilename('xlsx'));
}

function exportReviews() {
    if (!allReviews.length) {
        alert('No reviews!');
        return;
    }

    if (!confirmFreeUserExport()) {
        return;
    }

    const format = document.getElementById('exportFormat')?.value || 'csv';

    try {
        if (format === 'xlsx') {
            exportReviewsToXLSX();
        } else {
            exportReviewsToCSV();
        }
    } catch (error) {
        console.error('Export failed:', error);
        alert(`Export failed: ${error.message}`);
    }
}

document.getElementById('exportBtn').addEventListener('click', exportReviews);

function renderPage(page = 1) {
    const reviewsDiv = document.getElementById('reviews');
    const filteredReviews = getFilteredReviews();

    const start = (page - 1) * REVIEWS_PER_PAGE;
    const end = start + REVIEWS_PER_PAGE;
    const pageReviews = filteredReviews.slice(start, end);

    renderRatingFilters();
    renderAnalytics();

    if (!pageReviews.length) {
        reviewsDiv.innerHTML = `<p style="padding: 16px;">${
            ratingFilter ? `No ${ratingFilter}-star reviews found.` : 'No reviews found.'
        }</p>`;
        renderPaginationControls(page, filteredReviews.length);
        updateLoadingTotalReviews(allReviews.length);
        document.getElementById('exportBtn').disabled = !allReviews.length;
        return;
    }

    let tableHtml = `
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Reviewer</th>
                    <th>Rating</th>
                    <th>Date</th>
                    <th>Review Text</th>
                    <th>Item</th>
                </tr>
            </thead>
            <tbody>
    `;

    pageReviews.forEach((review, index) => {
        const reviewerEsc = String(review.reviewer).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const textEsc = String(review.text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const itemEsc = String(review.item).replace(/</g, '&lt;').replace(/>/g, '&gt;');

        tableHtml += `
            <tr>
                <td class="review-number">${start + index + 1}</td>
                <td>${reviewerEsc}</td>
                <td class="review-rating">${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}</td>
                <td>${review.date}</td>
                <td>${textEsc}</td>
                <td class="review-item"><a href="#">${itemEsc}</a></td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';
    reviewsDiv.innerHTML = tableHtml;
    renderPaginationControls(page, filteredReviews.length);
    updateLoadingTotalReviews(allReviews.length);
    document.getElementById('exportBtn').disabled = false;
}

function renderPaginationControls(page, totalReviews = allReviews.length) {
    const totalPages = Math.ceil(totalReviews / REVIEWS_PER_PAGE);
    const controlsDiv = document.getElementById('pagination-controls');
    controlsDiv.innerHTML = '';
    if (totalPages <= 1) return;

    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage < maxButtons - 1) {
        startPage = Math.max(1, endPage - maxButtons + 1);
    }

    if (page > 1) {
        const prev = document.createElement('span');
        prev.textContent = '← Prev';
        prev.onclick = () => {
            currentPage -= 1;
            renderPage(currentPage);
        };
        controlsDiv.appendChild(prev);
    }

    for (let i = startPage; i <= endPage; i += 1) {
        const pageBtn = document.createElement('span');
        pageBtn.textContent = String(i);
        if (i === page) pageBtn.classList.add('active');
        pageBtn.onclick = () => {
            currentPage = i;
            renderPage(currentPage);
        };
        controlsDiv.appendChild(pageBtn);
    }

    if (page < totalPages) {
        const next = document.createElement('span');
        next.textContent = 'Next →';
        next.onclick = () => {
            currentPage += 1;
            renderPage(currentPage);
        };
        controlsDiv.appendChild(next);
    }
}

function showSubscriptionBanner() {
    const reviewsDiv = document.getElementById('reviews');
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = 'background: #f0f3ff; border: 1px solid #667eea; border-radius: 8px; padding: 12px; margin-bottom: 16px; text-align: center;';
    statusDiv.innerHTML = `
        <strong>Subscription:</strong> ${isProUser ? '<span style="color: #27ae60;">PRO ✓</span>' : '<span style="color: #e67e22;">FREE</span>'}
        ${!isProUser ? `<br><small style="color: #7f8c8d;">Limited to ${FREE_USER_REVIEW_LIMIT} reviews. <a href="#" id="upgradeLink" style="color: #667eea;">Upgrade to PRO</a> for unlimited access.</small>` : ''}
    `;
    reviewsDiv.parentElement.insertBefore(statusDiv, reviewsDiv);

    if (!isProUser) {
        document.getElementById('upgradeLink')?.addEventListener('click', (e) => {
            e.preventDefault();
            openCheckout();
        });
    }

    updatePremiumButton();
}

function showLimitBanner() {
    const reviewsDiv = document.getElementById('reviews');
    reviewsDiv.insertAdjacentHTML('beforeend', `
        <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
            <h3 style="margin: 0 0 8px 0; color: #856404;">FREE User Limit Reached</h3>
            <p style="margin: 0 0 12px 0; color: #856404;">You've reached the maximum of <strong>${FREE_USER_REVIEW_LIMIT} reviews</strong> for FREE users.</p>
            <a href="#" id="upgradeNowLink" style="display: inline-block; background: #667eea; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                Upgrade to PRO for Unlimited Reviews
            </a>
        </div>
    `);

    document.getElementById('upgradeNowLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        openCheckout();
    });
}

function updateLoadingTotalReviews(count) {
    const el = document.getElementById('loadingTotalReviews');
    if (el) {
        el.textContent = count;
    }
}

function buildLoadingHtml(message, { stopping = false } = {}) {
    const count = allReviews.length;
    const stopLabel = stopping ? 'Stopping...' : 'Stop Fetching';
    const stopDisabled = stopping ? ' disabled' : '';

    return `
        <div class="spinner"></div>
        <div class="loading-stats">
            <span class="loading-count" id="loadingTotalReviews">${count}</span>
            <span class="loading-count-label">Total Reviews Collected</span>
        </div>
        <p>${message}</p>
        <p class="hint">This may take a few minutes</p>
        <div class="loading-actions">
            <button id="stopFetchBtn" class="btn-stop"${stopDisabled}>${stopLabel}</button>
        </div>
    `;
}

function hideLoading() {
    isFetching = false;
    document.getElementById('loading').style.display = 'none';
}

function stopFetching() {
    if (!isFetching || stopRequested) return;
    stopRequested = true;
    chrome.runtime.sendMessage({ type: 'stopReviewFetch', tabId: currentTabId });
    showStoppingState();
}

function showStoppingState() {
    const loadingDiv = document.getElementById('loading');
    if (!loadingDiv || loadingDiv.style.display === 'none') return;
    loadingDiv.innerHTML = buildLoadingHtml('Stopping fetch...', { stopping: true });
}

function handleFetchComplete(response, cancelled = false) {
    if (fetchFinished) return;
    fetchFinished = true;
    hideLoading();

    if (response?.reviews) {
        allReviews = response.reviews;
        document.getElementById('displayListingId').textContent = response.listingId || '-';
        document.getElementById('displayShopId').textContent = response.shopId || '-';
        updateJsDataHeader(response.jsData);
    }

    if (cancelled) {
        if (allReviews.length > 0) {
            renderPage(currentPage);
            const reviewsDiv = document.getElementById('reviews');
            reviewsDiv.insertAdjacentHTML('afterbegin', `
                <div class="warning" id="cancelledBanner">
                    Fetch stopped. Showing ${allReviews.length} review${allReviews.length === 1 ? '' : 's'} collected so far.
                </div>
            `);
        } else {
            document.getElementById('reviews').innerHTML = '<div class="warning">Fetch stopped. No reviews were collected.</div>';
        }
        return;
    }

    if (response?.limitReached) {
        showLimitBanner();
    }

    if (!allReviews.length) {
        document.getElementById('reviews').innerHTML = '<div class="error">⚠️ No reviews found for this listing.</div>';
        return;
    }

    renderPage(currentPage);
}

function updateLoading(message) {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    loadingDiv.innerHTML = buildLoadingHtml(message);
    document.getElementById('stopFetchBtn')?.addEventListener('click', stopFetching);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'reviewProgress') {
        if (stopRequested || fetchFinished) {
            return;
        }
        allReviews = message.reviews || [];
        document.getElementById('displayListingId').textContent = message.listingId;
        document.getElementById('displayShopId').textContent = message.shopId;
        updateLoadingTotalReviews(allReviews.length);
        updateJsDataHeader(message.jsData);
        renderAnalytics();
        const loadingMessage = document.querySelector('#loading > p');
        if (loadingMessage) {
            loadingMessage.textContent = `Fetching reviews... page ${message.page} (${allReviews.length} collected)`;
        }
        renderPage(currentPage);
    }

    if (message.type === 'reviewComplete') {
        handleFetchComplete(message);
    }

    if (message.type === 'reviewCancelled') {
        handleFetchComplete(message, true);
    }

    if (message.type === 'reviewError') {
        hideLoading();
        document.getElementById('reviews').innerHTML = `<div class="error">⚠️ ${message.message}</div>`;
    }
});

async function startReviewFetchFlow(tabId, { reviewScope, sortOption }) {
    const reviewsDiv = document.getElementById('reviews');

    showSubscriptionBanner();
    isFetching = true;
    stopRequested = false;
    fetchFinished = false;
    updateLoading('Fetching reviews from Etsy...');

    const delayConfig = await new Promise((resolve) => {
        chrome.storage.local.get(['fetchDelayMin', 'fetchDelayMax'], (result) => {
            resolve({
                min: result.fetchDelayMin || 1,
                max: result.fetchDelayMax || 3
            });
        });
    });

    chrome.runtime.sendMessage({
        type: 'startReviewFetch',
        tabId,
        isProUser,
        freeLimit: FREE_USER_REVIEW_LIMIT,
        delayMin: delayConfig.min,
        delayMax: delayConfig.max,
        reviewScope,
        sortOption
    }, (response) => {
        if (chrome.runtime.lastError) {
            hideLoading();
            reviewsDiv.innerHTML = '<div class="error">⚠️ Could not start review fetch. Reload the extension and try again.</div>';
            return;
        }

        if (response?.error) {
            hideLoading();
            reviewsDiv.innerHTML = `<div class="error">⚠️ ${response.error}</div>`;
            return;
        }

        if (response?.reviews) {
            handleFetchComplete(response, !!response.cancelled);
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const reviewsDiv = document.getElementById('reviews');
    const { tabId, reviewScope, sortOption } = getUrlParams();
    currentTabId = tabId;

    if (!tabId) {
        reviewsDiv.innerHTML = '<div class="error">⚠️ Open reviews from an Etsy listing tab using the extension popup.</div>';
        document.getElementById('loading').style.display = 'none';
        return;
    }

    try {
        const token = await new Promise((resolve) => {
            chrome.storage.local.get(['auth_token'], (result) => resolve(result.auth_token || null));
        });

        if (token) {
            const response = await fetch(`${API_CONFIG.BASE_URL}/subscription/me`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const subscription = await response.json();
                isProUser = SubscriptionHelper.hasProAccess(subscription);
            }
        }
    } catch (error) {
        console.error('Subscription check failed:', error);
    }

    updatePremiumButton();
    startReviewFetchFlow(tabId, { reviewScope, sortOption });
});
