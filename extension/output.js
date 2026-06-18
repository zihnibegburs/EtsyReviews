// Output page - Review fetching and display

const REVIEWS_PER_PAGE = 10;
const FREE_USER_REVIEW_LIMIT = 50;
let allReviews = [];
let currentPage = 1;
let userSubscription = null;
let isProUser = false;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatDate(raw) {
    const d = new Date(raw);
    if (isNaN(d)) return raw;
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// Get CSRF token
async function getCsrfToken() {
    try {
        const res = await fetch('https://www.etsy.com/', {
            headers: { 'User-Agent': navigator.userAgent },
            credentials: 'include'
        });
        if (!res.ok) throw new Error(`Failed: ${res.status}`);
        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        return doc.querySelector('meta[name="csrf_nonce"]')?.content ||
               doc.querySelector('meta[name="x-csrf-token"]')?.content || null;
    } catch(err) {
        console.error('CSRF token error:', err);
        return null;
    }
}

// Export reviews to CSV
function exportReviewsToCSV() {
    const start = (currentPage-1)*REVIEWS_PER_PAGE;
    const pageReviews = allReviews.slice(start, start+REVIEWS_PER_PAGE);
    if(!pageReviews.length){ alert("No reviews!"); return; }

    // Check if FREE user and show warning
    if (!isProUser && allReviews.length >= FREE_USER_REVIEW_LIMIT) {
        const confirmed = confirm(`You are exporting ${pageReviews.length} reviews from your ${FREE_USER_REVIEW_LIMIT} review limit.\n\nUpgrade to PRO for unlimited reviews!\n\nContinue export?`);
        if (!confirmed) return;
    }

    const rows = [["Reviewer","Rating","Date","Review Text","Item"]];
    pageReviews.forEach(r=>{
        const esc = s=>`"${String(s).replace(/"/g,'""')}"`;
        rows.push([esc(r.reviewer), esc(r.rating), esc(r.date||''), esc(r.text), esc(r.item)]);
    });

    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `etsy_reviews_page${currentPage}.csv`;
    link.click();
}

document.getElementById('exportCsvBtn').addEventListener('click', exportReviewsToCSV);

// Render reviews
function renderPage(page=1) {
    const reviewsDiv = document.getElementById('reviews');
    reviewsDiv.innerHTML = '';

    const start = (page-1)*REVIEWS_PER_PAGE;
    const end = start + REVIEWS_PER_PAGE;
    const pageReviews = allReviews.slice(start,end);

    if (!pageReviews.length) {
        reviewsDiv.innerHTML = "<p>No reviews found.</p>";
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

    pageReviews.forEach(r=>{
        const reviewerEsc = String(r.reviewer).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const textEsc = String(r.text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const itemEsc = String(r.item).replace(/</g, '&lt;').replace(/>/g, '&gt;');

        tableHtml += `
            <tr>
                <td>${reviewerEsc}</td>
                <td class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
                <td>${r.date}</td>
                <td>${textEsc}</td>
                <td class="review-item"><a href="#">${itemEsc}</a></td>
            </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    reviewsDiv.innerHTML = tableHtml;

    renderPaginationControls(page);

    // Update total
    document.getElementById('totalReviews').textContent = allReviews.length;

    // Enable export button
    document.getElementById('exportCsvBtn').disabled = false;
}

// Pagination
function renderPaginationControls(page) {
    const totalPages = Math.ceil(allReviews.length / REVIEWS_PER_PAGE);
    const controlsDiv = document.getElementById('pagination-controls');
    controlsDiv.innerHTML = '';
    if(totalPages <= 1) return;

    const maxButtons = 5;
    let startPage = Math.max(1,page-Math.floor(maxButtons/2));
    let endPage = Math.min(totalPages,startPage+maxButtons-1);
    if(endPage-startPage < maxButtons-1) startPage = Math.max(1,endPage-maxButtons+1);

    // Previous button
    if(page > 1){
        const prev = document.createElement('span');
        prev.textContent = '← Prev';
        prev.onclick = ()=>{ currentPage--; renderPage(currentPage); };
        controlsDiv.appendChild(prev);
    }

    // Page numbers
    for(let i=startPage;i<=endPage;i++){
        const pageBtn = document.createElement('span');
        pageBtn.textContent = i;
        if(i===page) pageBtn.classList.add('active');
        pageBtn.onclick = ()=>{ currentPage=i; renderPage(currentPage); };
        controlsDiv.appendChild(pageBtn);
    }

    // Next button
    if(page < totalPages){
        const next = document.createElement('span');
        next.textContent = 'Next →';
        next.onclick = ()=>{ currentPage++; renderPage(currentPage); };
        controlsDiv.appendChild(next);
    }
}

// Fetch reviews
document.addEventListener('DOMContentLoaded', async () => {
    const reviewsDiv = document.getElementById('reviews');
    const loadingDiv = document.getElementById('loading');
    loadingDiv.style.display = 'block';

    // Check subscription status first
    try {
        const token = await new Promise((resolve) => {
            chrome.storage.local.get(['auth_token'], (result) => {
                resolve(result.auth_token || null);
            });
        });

        if (token) {
            // Fetch subscription from backend
            const response = await fetch(`${API_CONFIG.BASE_URL}/subscription/me`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                userSubscription = await response.json();
                isProUser = userSubscription && userSubscription.status === 'ACTIVE';
                console.log('✅ Subscription status:', isProUser ? 'PRO' : 'FREE');
            } else {
                console.log('⚠️ Could not fetch subscription, assuming FREE user');
                isProUser = false;
            }
        }
    } catch (error) {
        console.error('❌ Error checking subscription:', error);
        isProUser = false;
    }

    chrome.runtime.sendMessage({ type: "getEtsyData" }, async (message) => {
        if (!message) {
            reviewsDiv.innerHTML = '<div class="error">⚠️ No Etsy data available. Please navigate to an Etsy listing page first.</div>';
            loadingDiv.style.display='none';
            return;
        }

        const { listingId, shopId, csrfToken } = message;
        if (!listingId || !shopId) {
            reviewsDiv.innerHTML = '<div class="error">⚠️ Missing listing or shop ID.</div>';
            loadingDiv.style.display='none';
            return;
        }

        // Display listing info
        document.getElementById('displayListingId').textContent = listingId;
        document.getElementById('displayShopId').textContent = shopId;

        // Display subscription status
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = 'background: #f0f3ff; border: 1px solid #667eea; border-radius: 8px; padding: 12px; margin-bottom: 16px; text-align: center;';
        statusDiv.innerHTML = `
            <strong>Subscription:</strong> ${isProUser ? '<span style="color: #27ae60;">PRO ✓</span>' : '<span style="color: #e67e22;">FREE</span>'}
            ${!isProUser ? `<br><small style="color: #7f8c8d;">Limited to ${FREE_USER_REVIEW_LIMIT} reviews. <a href="#" id="upgradeLink" style="color: #667eea;">Upgrade to PRO</a> for unlimited access.</small>` : ''}
        `;
        reviewsDiv.parentElement.insertBefore(statusDiv, reviewsDiv);

        // Add upgrade link handler
        if (!isProUser) {
            setTimeout(() => {
                document.getElementById('upgradeLink')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
                });
            }, 100);
        }

        let page = 1, hasMore = true;
        let currentCsrf = csrfToken; // Use stored token first

        // If no stored CSRF, try to get one
        if (!currentCsrf) {
            console.log('⚠️ No CSRF token from content script, fetching...');
            currentCsrf = await getCsrfToken();
        }

        if (!currentCsrf) {
            reviewsDiv.innerHTML = '<div class="error">⚠️ Could not get CSRF token. Please make sure you are logged into Etsy.</div>';
            loadingDiv.style.display = 'none';
            return;
        }

        console.log('✅ Using CSRF token:', currentCsrf.substring(0, 10) + '...');

        while (hasMore) {

            const bodyData = {
                log_performance_metrics:true,
                specs: { reviews:[ "Etsy\\Modules\\ListingPage\\Reviews\\DataComposer",
                { listing_id:listingId, shop_id:shopId, render_complete:true, active_tab:"shop_reviews",
                  should_lazy_load_images:true, should_use_pagination:true, page:page,
                  should_show_variations:false, is_reviews_untabbed_cached:false,
                  was_landing_from_external_referrer:false, sort_option:"Relevancy"} ]},
                runtime_analysis:false
            };

            try {
                console.log(`Fetching page ${page}...`);

                const res = await fetch(`https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/reviews`, {
                    method:"POST",
                    headers:{
                        "Content-Type":"application/json",
                        "x-csrf-token":currentCsrf,
                        "x-requested-with":"XMLHttpRequest",
                        "accept":"*/*",
                        "referer":`https://www.etsy.com/listing/${listingId}`
                    },
                    credentials:"include",
                    body:JSON.stringify(bodyData)
                });

                if(res.status === 429){
                    reviewsDiv.insertAdjacentHTML("beforeend", '<div class="warning">⚠️ Rate limit reached. Stopped fetching reviews.</div>');
                    break;
                }
                if(!res.ok){
                    reviewsDiv.insertAdjacentHTML("beforeend", `<div class="error">Error fetching reviews: ${res.status}</div>`);
                    break;
                }

                const data = await res.json();
                const htmlString = data?.output?.reviews || "";
                if(!htmlString.trim()) { hasMore = false; break; }

                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlString,"text/html");
                const reviewNodes = doc.querySelectorAll('.review-card');
                if(reviewNodes.length === 0){ hasMore = false; break; }

                reviewNodes.forEach(node => {
                    // Check FREE user limit
                    if (!isProUser && allReviews.length >= FREE_USER_REVIEW_LIMIT) {
                        console.log(`⚠️ FREE user limit reached (${FREE_USER_REVIEW_LIMIT} reviews)`);
                        return;
                    }

                    const reviewer = node.querySelector('a.wt-text-link-no-underline.wt-text-title-small')?.innerText.trim() || 'Anonymous';
                    const rating = parseInt(node.querySelector('input[name="rating"]')?.value || '0');
                    const text = node.querySelector('.wt-text-body')?.innerText.trim() || '';
                    const item = node.querySelector('a[data-review-link]')?.innerText.trim() || '';
                    const dateRaw = node.querySelector('.wt-text-body-small')?.innerText.trim() || '';
                    const date = formatDate(dateRaw);

                    allReviews.push({ reviewer, rating, text, item, date });
                });

                console.log(`Fetched ${reviewNodes.length} reviews from page ${page} (Total: ${allReviews.length})`);

                // Check if FREE user reached limit
                if (!isProUser && allReviews.length >= FREE_USER_REVIEW_LIMIT) {
                    console.log(`🛑 FREE user limit reached (${FREE_USER_REVIEW_LIMIT} reviews)`);
                    reviewsDiv.insertAdjacentHTML("beforeend", `
                        <div style="background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; padding: 16px; margin: 16px 0; text-align: center;">
                            <h3 style="margin: 0 0 8px 0; color: #856404;">📊 FREE User Limit Reached</h3>
                            <p style="margin: 0 0 12px 0; color: #856404;">You've reached the maximum of <strong>${FREE_USER_REVIEW_LIMIT} reviews</strong> for FREE users.</p>
                            <a href="#" id="upgradeNowLink" style="display: inline-block; background: #667eea; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
                                🚀 Upgrade to PRO for Unlimited Reviews
                            </a>
                        </div>
                    `);

                    setTimeout(() => {
                        document.getElementById('upgradeNowLink')?.addEventListener('click', (e) => {
                            e.preventDefault();
                            chrome.tabs.create({ url: chrome.runtime.getURL('checkout.html') });
                        });
                    }, 100);

                    hasMore = false;
                }

                renderPage(currentPage);
                page++;

                // Delay between requests - load from settings (random delay between min-max seconds)
                const delayConfig = await new Promise((resolve) => {
                    chrome.storage.local.get(['fetchDelayMin', 'fetchDelayMax'], (result) => {
                        resolve({
                            min: result.fetchDelayMin || 1,
                            max: result.fetchDelayMax || 3
                        });
                    });
                });

                // Calculate random delay in milliseconds
                const randomDelay = (delayConfig.min + Math.random() * (delayConfig.max - delayConfig.min)) * 1000;
                console.log(`⏳ Waiting ${(randomDelay/1000).toFixed(2)} seconds (range: ${delayConfig.min}-${delayConfig.max}s) before next request...`);

                // Update loading message
                loadingDiv.innerHTML = `<div class="spinner"></div><p>Fetching reviews... (Page ${page})<br>Next request in ${(randomDelay/1000).toFixed(1)}s</p>`;

                await sleep(randomDelay);

            } catch(err){
                reviewsDiv.insertAdjacentHTML("beforeend", `<div class="error">Error fetching reviews: ${err.message}</div>`);
                break;
            }
        }

        loadingDiv.style.display = 'none';
        console.log(`Total reviews fetched: ${allReviews.length}`);
    });
});

