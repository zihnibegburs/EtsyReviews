let csrfToken = null;
let listingId = null;
let shopId = null;
let categoryPath = [];

const fetchButton = document.getElementById("fetchReviews");

// Listen for Etsy data
chrome.runtime.sendMessage({ type: "getEtsyData" }, (data) => {
  if (data?.csrfToken && data?.listingId && data?.shopId) {
    csrfToken = data.csrfToken;
    listingId = data.listingId;
    shopId = data.shopId;
    categoryPath = data.categoryPath || [];
    fetchButton.disabled = false;
    console.log("Popup received Etsy data:", data);
  } else {
    console.warn("No Etsy data yet. Try refreshing the listing page.");
  }
});

// Open reviews export
fetchButton.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("output.html") });
});

// Sidebar page switching
const pages = {
  homeBtn: "homePage",
  helpBtn: "helpPage",
  settingsBtn: "settingsPage",
  proBtn: "proPage"
};

Object.keys(pages).forEach((btnId) => {
  const btn = document.getElementById(btnId);
  btn.addEventListener("click", () => {
    // hide all pages
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    // show selected page
    document.getElementById(pages[btnId]).classList.add("active");

    // update active button style
    document.querySelectorAll(".sidebar .icon").forEach(i => i.classList.remove("active"));
    btn.classList.add("active");
  });
});
