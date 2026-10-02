importScripts("i18n.js");

// Promptly Extension — service worker (Manifest V3)
// Sağ tık menüsünü kurar, seçili metni yakalayıp popup'a aktarır.

const MENU_ID = "promptly-save-selection";
const STORAGE_KEY = "pendingCapture";

async function createMenu() {
  await PromptlyI18n.init();
  // removeAll → yeniden yükleme/güncellemede "duplicate id" hatasını önler.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: PromptlyI18n.t("menuSave"),
      contexts: ["selection"],
    });
  });
}

// Dil değişince menü başlığını güncelle.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lang) createMenu();
});

chrome.runtime.onInstalled.addListener(createMenu);
chrome.runtime.onStartup.addListener(createMenu);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID) return;

  const text = (info.selectionText || "").trim();
  if (!text) return;

  const capture = {
    text,
    pageUrl: info.pageUrl || tab?.url || "",
    pageTitle: tab?.title || "",
    capturedAt: new Date().toISOString(),
  };

  await chrome.storage.local.set({ [STORAGE_KEY]: capture });

  // Popup'ı açmayı dene (Chrome 127+, kullanıcı hareketi gerekir — menü tıklaması sayılır).
  try {
    await chrome.action.openPopup();
  } catch {
    // Açılamazsa rozet kullanıcıya bekleyen bir yakalama olduğunu gösterir.
    await chrome.action.setBadgeBackgroundColor({ color: "#7c5cff" });
    await chrome.action.setBadgeText({ text: "1" });
  }
});
