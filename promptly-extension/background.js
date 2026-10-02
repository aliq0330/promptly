importScripts("config.js", "i18n.js", "api.js", "queue.js");

// Promptly Extension — service worker (Manifest V3)
// Sağ tık → yakalama her zaman önce yerel kuyruğa yazılır; oturum varsa hemen
// TASLAK olarak Promptly'ye gönderilir, yoksa girişten sonra otomatik gönderilir.

const MENU_ID = "promptly-save-selection";

/* Tüm yazma işlemleri tek sırada çalışır: çift kayıt ve kayıp güncelleme olmaz. */
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

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

let badgeTimer = null;
async function updateBadge(justSaved) {
  clearTimeout(badgeTimer);
  const pending = (await PromptlyQueue.getQueue()).length;
  if (pending > 0) {
    await chrome.action.setBadgeBackgroundColor({ color: "#d98a1f" });
    await chrome.action.setBadgeText({ text: String(pending) });
  } else if (justSaved) {
    await chrome.action.setBadgeBackgroundColor({ color: "#1f9d6b" });
    await chrome.action.setBadgeText({ text: "✓" });
    badgeTimer = setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

// Kuyruğu sırayla taslağa gönderir; gönderilemeyen (veya oturum yoksa) kuyrukta kalır.
async function flushQueue() {
  await PromptlyI18n.init();
  let savedAny = false;
  try {
    if (await PromptlyApi.getSession()) {
      for (;;) {
        const queue = await PromptlyQueue.getQueue();
        const item = queue[0];
        if (!item) break;
        const result = await PromptlyApi.saveDraft({
          title: PromptlyQueue.guessTitle(item.text),
          text: item.text,
          sourceUrl: item.pageUrl,
        });
        // Önce kayıt geçmişi, sonra kuyruktan çıkar: arada kesilirse çift kayıt değil, en kötü ihtimalle tekrar denenir.
        await PromptlyQueue.addSaved({
          id: result.id,
          title: PromptlyQueue.guessTitle(item.text),
          url: result.url,
          savedAt: new Date().toISOString(),
        });
        await PromptlyQueue.setQueue(queue.filter((q) => q.id !== item.id));
        savedAny = true;
      }
    }
    await PromptlyQueue.setError("");
  } catch (err) {
    if (err.code !== "no_session") await PromptlyQueue.setError(err.message || "error");
  }
  await updateBadge(savedAny);
}

async function captureAndSave(info, tab) {
  const text = (info.selectionText || "").trim();
  if (!text) return;
  const queue = await PromptlyQueue.getQueue();
  queue.push({
    id: crypto.randomUUID(),
    text,
    pageUrl: info.pageUrl || tab?.url || "",
    pageTitle: tab?.title || "",
    capturedAt: new Date().toISOString(),
  });
  await PromptlyQueue.setQueue(queue);
  await flushQueue();
}

chrome.runtime.onInstalled.addListener(() => { createMenu(); serial(flushQueue); });
chrome.runtime.onStartup.addListener(() => { createMenu(); serial(flushQueue); });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) serial(() => captureAndSave(info, tab));
});

// Giriş yapılınca (session yazılınca) bekleyenler otomatik taslağa gönderilir.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lang) createMenu();
  if (changes.session && changes.session.newValue) serial(flushQueue);
});

// Popup'tan gelen istekler (yazma işlemleri burada serileştirilir).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== chrome.runtime.id) return;
  if (msg?.type === "flush") serial(flushQueue);
  if (msg?.type === "remove" && typeof msg.id === "string") {
    serial(async () => {
      const queue = await PromptlyQueue.getQueue();
      await PromptlyQueue.setQueue(queue.filter((q) => q.id !== msg.id));
      await updateBadge(false);
    });
  }
});
