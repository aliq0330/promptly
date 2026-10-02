// Promptly Extension — popup
// background.js'in storage'a yazdığı bekleyen yakalamayı gösterir.

const STORAGE_KEY = "pendingCapture";

const els = {
  empty: document.getElementById("empty"),
  capture: document.getElementById("capture"),
  text: document.getElementById("text"),
  count: document.getElementById("count"),
  source: document.getElementById("source"),
  copy: document.getElementById("copy"),
  clear: document.getElementById("clear"),
};

function render(capture) {
  const has = Boolean(capture && capture.text);
  els.empty.hidden = has;
  els.capture.hidden = !has;
  if (!has) return;

  els.text.value = capture.text;
  els.count.textContent = `${capture.text.length} karakter`;

  // Yalnızca http(s) bağlantıları tıklanabilir yap.
  let href = "";
  try {
    const u = new URL(capture.pageUrl);
    if (u.protocol === "http:" || u.protocol === "https:") href = u.href;
  } catch {
    /* geçersiz URL */
  }
  if (href) {
    els.source.href = href;
    els.source.textContent = capture.pageTitle || new URL(href).hostname;
    els.source.hidden = false;
  } else {
    els.source.hidden = true;
  }
}

els.text.addEventListener("input", () => {
  els.count.textContent = `${els.text.value.length} karakter`;
});

els.copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(els.text.value);
    els.copy.textContent = "Kopyalandı";
  } catch {
    els.copy.textContent = "Kopyalanamadı";
  }
  setTimeout(() => (els.copy.textContent = "Kopyala"), 1500);
});

els.clear.addEventListener("click", async () => {
  await chrome.storage.local.remove(STORAGE_KEY);
  await chrome.action.setBadgeText({ text: "" });
});

// Popup açıkken yeni bir yakalama gelirse/temizlenirse güncelle.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[STORAGE_KEY]) render(changes[STORAGE_KEY].newValue);
});

(async function init() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  render(data[STORAGE_KEY]);
  // Popup açıldı → rozet artık gereksiz.
  await chrome.action.setBadgeText({ text: "" });
})();
