// Content Script for Etsy Listing Pages
console.log('🚀 Etsy Review Scraper - Content script loaded');
console.log('📍 Current URL:', window.location.href);

// Wait for Etsy data and send to background
function waitForEtsyData(maxRetries = 30, interval = 500) {
    let tries = 0;

    const check = async () => {
        tries++;
        console.log(`🔍 Attempt ${tries}/${maxRetries} - Looking for Etsy data...`);

        // Get CSRF token - multiple methods
        let csrfToken = document.querySelector('meta[name="csrf_nonce"]')?.content ||
                        document.querySelector('meta[name="x-csrf-token"]')?.content;

        // Try script tags if not found
        if (!csrfToken) {
            const scripts = document.querySelectorAll('script');
            for (const script of scripts) {
                const match = script.textContent.match(/"csrf_nonce":"([^"]+)"/);
                if (match) {
                    csrfToken = match[1];
                    break;
                }
            }
        }

        // Get listing ID - multiple methods
        let listingId = window.__etsy_server_data__?.listing_id || null;
        if (!listingId) {
            const match = window.location.pathname.match(/listing\/(\d+)/);
            if (match) listingId = parseInt(match[1], 10);
        }

        console.log(`   CSRF: ${csrfToken ? '✓' : '✗'}`);
        console.log(`   Listing ID: ${listingId || '✗'}`);

        // Get shop ID - multiple methods
        let shopId = null;

        // Method 1: __etsy_server_data__
        if (window.__etsy_server_data__?.shop_id) {
            shopId = window.__etsy_server_data__.shop_id;
        }

        // Method 2: JSON scripts
        if (!shopId) {
            const scripts = Array.from(document.querySelectorAll('script[type="application/json"]'));
            for (const s of scripts) {
                try {
                    const json = JSON.parse(s.textContent);
                    if (json.listing?.shop_id) {
                        shopId = json.listing.shop_id;
                        break;
                    }
                    if (json.shop?.shop_id) {
                        shopId = json.shop.shop_id;
                        break;
                    }
                } catch {}
            }
        }

        // Method 3: HTML regex search
        if (!shopId) {
            const bodyText = document.body.innerHTML;
            const match = bodyText.match(/"shop_id":(\d+)/);
            if (match) shopId = parseInt(match[1], 10);
        }

        console.log(`   Shop ID: ${shopId || '✗'}`);

        // If we have minimum required data (listing + shop), send to background
        if (listingId && shopId) {
            console.log('✅ Etsy data complete!');
            console.log('📤 Sending to background:', { listingId, shopId, hasCsrf: !!csrfToken });

            chrome.runtime.sendMessage({
                type: "etsyData",
                csrfToken: csrfToken || null,
                listingId,
                shopId,
                categoryPath: []
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('❌ Error sending message:', chrome.runtime.lastError);
                } else {
                    console.log('✅ Etsy data sent successfully');
                }
            });
            return;
        }

        // Retry if not found
        if (tries < maxRetries) {
            setTimeout(check, interval);
        } else {
            console.error(`❌ Failed to scrape Etsy data after ${maxRetries} attempts`);
            console.error('   Found:', { csrfToken: !!csrfToken, listingId, shopId });
        }
    };

    check();
}

// Start scraping when page loads
if (document.readyState === 'loading') {
    window.addEventListener('load', () => waitForEtsyData());
} else {
    waitForEtsyData();
}

// Listen for subscription status (for premium features)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'subscriptionActive') {
        console.log('Premium features activated:', request.subscription);
        // Add premium features here if needed
        sendResponse({ success: true });
    }
    return true;
});

console.log('Content script initialized');

