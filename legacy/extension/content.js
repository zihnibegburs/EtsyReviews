function waitForEtsyData(maxRetries = 20, interval = 500) {
  let tries = 0;

  const check = async () => {
    const csrfToken = document.querySelector('meta[name="csrf_nonce"]')?.content ||
                      document.querySelector('meta[name="x-csrf-token"]')?.content;

    let listingId = window.__etsy_server_data__?.listing_id || null;
    if (!listingId) {
      const match = window.location.pathname.match(/listing\/(\d+)/);
      if (match) listingId = parseInt(match[1], 10);
    }

    let shopId = null;
    const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
    for (const s of scripts) {
      try {
        const json = JSON.parse(s.textContent);
        if (json.listing?.shop_id) {
          shopId = json.listing.shop_id;
          break;
        }
      } catch {}
    }

    if (!shopId) {
      try {
        const res = await fetch(`https://www.etsy.com/listing/${listingId}`);
        const html = await res.text();
        const match = html.match(/"shop_id":(\d+)/);
        if (match) shopId = parseInt(match[1], 10);
      } catch(e) {}
    }

    if (csrfToken && listingId && shopId) {
      chrome.runtime.sendMessage({
        type: "etsyData",
        csrfToken,
        listingId,
        shopId
      });
      return;
    }

    if (++tries < maxRetries) {
      setTimeout(check, interval);
    } else {
      console.warn("Failed to scrape Etsy data after retries");
    }
  };

  check();
}

window.addEventListener("load", () => waitForEtsyData());
