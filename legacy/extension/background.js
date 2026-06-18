let etsyData = null;

const AUTH_START = "https://localhost:3000/auth/google/start?src=ext";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "auth:signin") {
    chrome.tabs.create({ url: AUTH_START }, () => sendResponse({ ok: true }));
    return true; // async response
  }
});

// Optional: listen for success from the closing page (postMessage)
window.addEventListener("message", (e) => {
  if (e?.data?.type === "auth:success") {
    // update extension state if you want
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "etsyData") {
    etsyData = msg; // store latest data
  }
  if (msg.type === "getEtsyData") {
    sendResponse(etsyData);
  }
});