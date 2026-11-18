// Promptly uzantısı (önizleme) — service worker.
// Sağ tık menüsü + kısayollar sayfaya YALNIZ o an (activeTab) yakalama kartı / palet enjekte eder; kalıcı sayfa erişimi yoktur.
importScripts("shared/i18n.js", "shared/store.js");

const MENU_TEXT = "ply-save-text";
const MENU_IMAGE = "ply-save-image";
const FILES = ["shared/i18n.js", "shared/store.js", "content/overlay.js"];

async function createMenus() {
  await PI.init();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_TEXT, title: PI.t("menuSaveText"), contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU_IMAGE, title: PI.t("menuSaveImage"), contexts: ["image"] });
  });
}

let badgeTimer = null;
async function updateBadge() {
  clearTimeout(badgeTimer);
  const { pending } = await PStore.getAll();
  if (pending.length) {
    await chrome.action.setBadgeBackgroundColor({ color: "#a24a06" });
    await chrome.action.setBadgeText({ text: String(pending.length) });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}
async function flashBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(updateBadge, 3000);
}

// Sayfaya yakalama kartı / palet enjekte eder. chrome:// gibi korumalı sayfalarda kısa süre "!" gösterir.
async function inject(tabId, message) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    flashBadge("!", "#bd2828");
  }
}

async function selectionOf(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: () => String(window.getSelection() || "") });
    return (res && res.result) || "";
  } catch { return ""; }
}

chrome.runtime.onInstalled.addListener(async () => { await PStore.seed(); await createMenus(); await updateBadge(); });
chrome.runtime.onStartup.addListener(() => { createMenus(); updateBadge(); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const base = { type: "ply:capture", pageUrl: info.pageUrl || tab.url || "", pageTitle: tab.title || "" };
  if (info.menuItemId === MENU_TEXT) inject(tab.id, { ...base, text: info.selectionText || "" });
  if (info.menuItemId === MENU_IMAGE) inject(tab.id, { ...base, text: "", imageUrl: info.srcUrl || "" });
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || tab.id == null) return;
  if (command === "save-selection") {
    const text = await selectionOf(tab.id);
    inject(tab.id, { type: "ply:capture", text, pageUrl: tab.url || "", pageTitle: tab.title || "" });
  }
  if (command === "open-palette") inject(tab.id, { type: "ply:palette" });
});

// Depo değişince: dil → menü metinleri; çevrimiçi + oturum → bekleyenleri taslağa gönder; rozet.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  if (changes.lang) createMenus();
  if (changes.online || changes.session || changes.pending) await PStore.flushPending();
  if (changes.pending || changes.online || changes.session) updateBadge();
});
