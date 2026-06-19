// Output page - Review fetching and display

const REVIEWS_PER_PAGE = 10;
const FREE_USER_REVIEW_LIMIT = 50;
let allReviews = [];
let currentPage = 1;
let isProUser = false;

function getTabIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const tabId = parseInt(params.get('tabId'), 10);
    return Number.isNaN(tabId) ? null : tabId;
}

function exportReviewsToCSV() {
    const start = (currentPage - 1) * REVIEWS_PER_PAGE;
    const pageReviews = allReviews.slice(start, start + REVIEWS_PER_PAGE);
    if (!pageReviews.length) {
        alert('No reviews!');
        return;
    }

    if (!isProUser && allReviews.length >= FREE_USER_REVIEW_LIMIT) {
        const confirmed = confirm(`You are exporting ${pageReviews.length} reviews from your ${FREE_USER_REVIEW_LIMIT} review limit.\n\nUpgrade to PRO for unlimited reviews!\n\nContinue export?`);
        if (!confirmed) return;
    }

    const rows = [['Reviewer', 'Rating', 'Date', 'Review Text', 'Item']];
    pageReviews.forEach((review) => {
        const esc = (value) => `"${String(value).replace(/"/g, '""')}"`;
        rows.push([esc(review.reviewer), esc(review.rating), esc(review.date || ''), esc(review.text), esc(review.item)]);
    });

    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `etsy_reviews_page${currentPage}.csv`;
    link.click();
}

document.getElementById('exportCsvBtn').addEventListener('click', exportReviewsToCSV);

function renderPage(page = 1) {
    const reviewsDiv = document.getElementById('reviews');
    reviewsDiv.innerHTML = '';

    const start = (page - 1) * REVIEWS_PER_PAGE;
    const end = start + REVIEWS_PER_PAGE;
    const pageReviews = allReviews.slice(start, end);

    if (!pageReviews.length) {
        reviewsDiv.innerHTML = '<p>No reviews found.</p>';
        return;
    }

    let tableHtml = `
        <table>
            <thead>
                <tr>
                    <th>Reviewer</th>
                    <th>Rating</th>
                    <th>Date</th>
                    <th>Review Text</th>
                    <th>Item</th>
                </tr>
            </thead>
            <tbody>
    `;

    pageReviews.forEach((review) => {
        const reviewerEsc = String(review.reviewer).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const textEsc = String(review.text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const itemEsc = String(review.item).replace(/</g, '&lt;').replace(/>/g, '&gt;');

        tableHtml += `
            <tr>
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
    renderPaginationControls(page);
    document.getElementById('totalReviews').textContent = allReviews.length;
    document.getElementById('exportCsvBtn').disabled = false;
}

function renderPaginationControls(page) {
    const totalPages = Math.ceil(allReviews.length / REVIEWS_PER_PAGE);
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
            chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
        });
    }
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
        chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
    });
}

function updateLoading(message) {
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';
    loadingDiv.innerHTML = `<div class="spinner"></div><p>${message}</p>`;
}

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'reviewProgress') {
        allReviews = message.reviews || [];
        document.getElementById('displayListingId').textContent = message.listingId;
        document.getElementById('displayShopId').textContent = message.shopId;
        document.getElementById('totalReviews').textContent = allReviews.length;
        updateLoading(`Fetching reviews... page ${message.page} (${allReviews.length} collected)`);
        renderPage(currentPage);
    }

    if (message.type === 'reviewComplete') {
        allReviews = message.reviews || [];
        document.getElementById('loading').style.display = 'none';
        if (message.limitReached) {
            showLimitBanner();
        }
        renderPage(currentPage);
    }

    if (message.type === 'reviewError') {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('reviews').innerHTML = `<div class="error">⚠️ ${message.message}</div>`;
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const reviewsDiv = document.getElementById('reviews');
    const tabId = getTabIdFromUrl();

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
                isProUser = subscription?.status === 'ACTIVE';
            }
        }
    } catch (error) {
        console.error('Subscription check failed:', error);
    }

    showSubscriptionBanner();
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
        delayMax: delayConfig.max
    }, (response) => {
        if (chrome.runtime.lastError) {
            document.getElementById('loading').style.display = 'none';
            reviewsDiv.innerHTML = '<div class="error">⚠️ Could not start review fetch. Reload the extension and try again.</div>';
            return;
        }

        if (response?.error) {
            document.getElementById('loading').style.display = 'none';
            reviewsDiv.innerHTML = `<div class="error">⚠️ ${response.error}</div>`;
            return;
        }

        if (response?.reviews) {
            allReviews = response.reviews;
            document.getElementById('displayListingId').textContent = response.listingId;
            document.getElementById('displayShopId').textContent = response.shopId;
            document.getElementById('loading').style.display = 'none';
            if (response.limitReached) {
                showLimitBanner();
            }
            if (allReviews.length === 0) {
                reviewsDiv.innerHTML = '<div class="error">⚠️ No reviews found for this listing.</div>';
                return;
            }
            renderPage(currentPage);
        }
    });
});
