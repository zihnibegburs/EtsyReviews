const REVIEWS_PER_PAGE = 10;
let allReviews = [];
let currentPage = 1;

const sleep = ms => new Promise(r => setTimeout(r, ms));
function formatDate(raw) {
  const d = new Date(raw);
  if (isNaN(d)) return raw;
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

// ------------------- CSRF -------------------
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

// ------------------- CSV Export -------------------
function exportReviewsToCSV() {
  const start = (currentPage-1)*REVIEWS_PER_PAGE;
  const pageReviews = allReviews.slice(start, start+REVIEWS_PER_PAGE);
  if(!pageReviews.length){ alert("No reviews!"); return; }

  const rows = [["Reviewer","Rating","Date","Review Text","Item"]];
  pageReviews.forEach(r=>{
    const esc = s=>`"${s.replace(/"/g,'""')}"`;
    rows.push([esc(r.reviewer), esc(r.rating), esc(r.date||''), esc(r.text), esc(r.item)]);
  });

  const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], {type:'text/csv'});
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `etsy_reviews_page${currentPage}.csv`;
  link.click();
}
document.getElementById('exportCsvBtn').addEventListener('click', exportReviewsToCSV);

// ------------------- Render -------------------
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
    tableHtml += `
      <tr>
        <td>${r.reviewer}</td>
        <td class="review-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</td>
        <td>${r.date}</td>
        <td>${r.text}</td>
        <td class="review-item"><a href="#">${r.item}</a></td>
      </tr>
    `;
  });

  tableHtml += `</tbody></table>`;
  reviewsDiv.innerHTML = tableHtml;

  renderPaginationControls(page);
}


// ------------------- Pagination -------------------
function renderPaginationControls(page) {
  const totalPages = Math.ceil(allReviews.length / REVIEWS_PER_PAGE);
  const controlsDiv = document.getElementById('pagination-controls');
  controlsDiv.innerHTML = '';
  if(totalPages <= 1) return;

  const maxButtons = 5;
  let startPage = Math.max(1,page-Math.floor(maxButtons/2));
  let endPage = Math.min(totalPages,startPage+maxButtons-1);
  if(endPage-startPage < maxButtons-1) startPage = Math.max(1,endPage-maxButtons+1);

  for(let i=startPage;i<=endPage;i++){
    const pageBtn = document.createElement('span');
    pageBtn.textContent = i;
    if(i===page) pageBtn.classList.add('active');
    pageBtn.onclick = ()=>{ currentPage=i; renderPage(currentPage); };
    controlsDiv.appendChild(pageBtn);
  }

  if(page < totalPages){
    const next = document.createElement('span');
    next.textContent = 'Next';
    next.onclick = ()=>{ currentPage++; renderPage(currentPage); };
    controlsDiv.appendChild(next);

    if(page > 1){
      const prev = document.createElement('span');
      prev.textContent = 'Prev';
      prev.onclick = ()=>{ currentPage--; renderPage(currentPage); };
      controlsDiv.appendChild(prev);
    }
  }
}

// ------------------- Fetch Reviews -------------------
document.addEventListener('DOMContentLoaded', () => {
  const reviewsDiv = document.getElementById('reviews');
  const loadingDiv = document.getElementById('loading');
  loadingDiv.style.display = 'block';

  chrome.runtime.sendMessage({ type: "getEtsyData" }, async (message) => {
    if (!message) { reviewsDiv.innerText = "⚠️ No Etsy data available."; loadingDiv.style.display='none'; return; }

    const { listingId, shopId } = message;
    if (!listingId || !shopId) { reviewsDiv.innerText = "⚠️ Missing listing or shop ID."; loadingDiv.style.display='none'; return; }

    let page = 1, hasMore = true;

    while (hasMore) {
      const csrfToken = await getCsrfToken();
      if (!csrfToken) { reviewsDiv.innerText = "⚠️ Could not get CSRF token"; break; }

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
        const res = await fetch(`https://www.etsy.com/api/v3/ajax/bespoke/member/neu/specs/reviews`, {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "x-csrf-token":csrfToken,
            "x-requested-with":"XMLHttpRequest",
            "accept":"*/*",
            "referer":`https://www.etsy.com/listing/${listingId}`
          },
          credentials:"include",
          body:JSON.stringify(bodyData)
        });

        if(res.status === 429){
          reviewsDiv.insertAdjacentHTML("beforeend", `<div style="color:red;">⚠️ Rate limit reached. Stopped fetching reviews.</div>`);
          break;
        }
        if(!res.ok){ reviewsDiv.innerText = `Error fetching reviews: ${res.status}`; break; }

        const data = await res.json();
        const htmlString = data?.output?.reviews || "";
        if(!htmlString.trim()) { hasMore = false; break; }

        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString,"text/html");
        const reviewNodes = doc.querySelectorAll('.review-card');
        if(reviewNodes.length === 0){ hasMore = false; break; }

        reviewNodes.forEach(node => {
          const reviewer = node.querySelector('a.wt-text-link-no-underline.wt-text-title-small')?.innerText.trim() || 'Anonymous';
          const rating = parseInt(node.querySelector('input[name="rating"]')?.value || '0');
          const text = node.querySelector('.wt-text-body')?.innerText.trim() || '';
          const item = node.querySelector('a[data-review-link]')?.innerText.trim() || '';
          const dateRaw = node.querySelector('.wt-text-body-small')?.innerText.trim() || '';
          const date = formatDate(dateRaw);

          allReviews.push({ reviewer, rating, text, item, date });
        });

        renderPage(currentPage);
        page++;
        await sleep(3000 + Math.random()*1000);

      } catch(err){
        reviewsDiv.insertAdjacentHTML("beforeend", `<div style="color:red;">Error fetching reviews: ${err.message}</div>`);
        break;
      }
    }

    loadingDiv.style.display = 'none';
  });
});
