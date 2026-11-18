// Promptly uzantısı — service worker (Manifest V3).
// Sağ tık / kısayol → o sekmeye (activeTab) yakalama kartı ya da palet enjekte eder; kalıcı sayfa erişimi yoktur (yalnız kullanıcının açtığı siteler: shared/slash.js).
// Belirteçler, kuyruk ve ağ YALNIZ burada ve uzantı sayfalarında: sayfaya enjekte edilen betik depoya erişemez (TRUSTED_CONTEXTS), her şeyi mesajla ister.
importScripts("config.js", "shared/i18n.js", "shared/vars.js", "shared/store.js", "shared/auth.js", "shared/api.js", "shared/queue.js", "shared/library.js", "shared/slash.js");

try { chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }); } catch { /* eski sürümde yok */ }

const MENU_TEXT = "ply-save-text";
const MENU_IMAGE = "ply-save-image";
const FLUSH_ALARM = "promptly-flush";

/* Tüm yazmalar (kuyruk boşaltma) tek sırada çalışır: çift gönderim olmaz. */
let chain = Promise.resolve();
function serial(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

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
  const { queue } = await PStore.getAll();
  const waiting = queue.filter((q) => q.state === "queued").length;
  const failed = queue.filter((q) => q.state === "failed").length;
  if (waiting) { await chrome.action.setBadgeBackgroundColor({ color: "#a24a06" }); await chrome.action.setBadgeText({ text: String(waiting) }); }
  else if (failed) { await chrome.action.setBadgeBackgroundColor({ color: "#bd2828" }); await chrome.action.setBadgeText({ text: "!" }); }
  else await chrome.action.setBadgeText({ text: "" });
}
async function flashBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(updateBadge, 3000);
}

async function flushNow() {
  const result = await PQueue.flush({ signedIn: PAuth.signedIn, send: PApi.sendDraft });
  await updateBadge();
  return result;
}

const CONTENT_FILES = PSlash.CONTENT_FILES;
// Sayfaya yakalama kartı / palet enjekte eder. chrome:// gibi korumalı sayfalarda kısa süre "!" gösterir.
async function inject(tabId, message) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
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

function startup() {
  createMenus();
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  PSlash.reconcile().catch(() => {});
  serial(flushNow);
}
chrome.runtime.onInstalled.addListener(startup);
chrome.runtime.onStartup.addListener(startup);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === FLUSH_ALARM) serial(flushNow); });
chrome.permissions.onRemoved.addListener(() => PSlash.reconcile().catch(() => {}));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  const base = { type: "ply:capture", pageUrl: info.pageUrl || tab.url || "", pageTitle: tab.title || "" };
  if (info.menuItemId === MENU_TEXT) inject(tab.id, { ...base, text: info.selectionText || "" });
  if (info.menuItemId === MENU_IMAGE) inject(tab.id, { ...base, text: "", imageUrl: info.srcUrl || "" });
});
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || tab.id == null) return;
  if (command === "save-selection") inject(tab.id, { type: "ply:capture", text: await selectionOf(tab.id), pageUrl: tab.url || "", pageTitle: tab.title || "" });
  if (command === "open-palette") inject(tab.id, { type: "ply:palette" });
});

// Dil değişince menüler; oturum/kuyruk değişince rozet.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.lang) createMenus();
  if (changes.queue || changes.auth) updateBadge();
  if (changes.auth && changes.auth.newValue && changes.auth.newValue.refreshToken && !(changes.auth.oldValue && changes.auth.oldValue.refreshToken)) serial(flushNow);
});

// ---- Mesajlar (popup, yan panel, sayfadaki katman) ----
const str = (v, n) => String(v == null ? "" : v).slice(0, n);
function cleanDraft(d) {
  const type = ["image", "text", "audio", "video"].includes(d && d.type) ? d.type : "text";
  return {
    title: str(d && d.title, PVars.LIMITS.title).trim(),
    text: str(d && d.text, PVars.LIMITS.promptText + 1),
    type,
    tools: Array.isArray(d && d.tools) ? d.tools.slice(0, PVars.LIMITS.tools).map((t) => str(t, 60)) : [],
    tags: Array.isArray(d && d.tags) ? d.tags.slice(0, PVars.LIMITS.tags).map((t) => str(t, PVars.LIMITS.tagLabel)) : [],
    origin: d && d.origin === "own" ? "own" : "external",
    sourceUrl: str(d && d.sourceUrl, PVars.LIMITS.sourceUrl),
    sourceTitle: str(d && d.sourceTitle, 200),
    imageUrl: str(d && d.imageUrl, 2048),
  };
}
const fail = (err) => ({ error: { code: (err && err.code) || "error", message: (err && err.message) || "" } });

const handlers = {
  async "ply:state"(msg) {
    await PI.init();
    const auth = await PStore.get("auth");
    const origin = typeof msg.origin === "string" ? msg.origin : "";
    return { signedIn: Boolean(auth && auth.refreshToken), canWrite: PAuth.canWrite(auth), lang: PI.getLang(), slash: origin ? await PSlash.isEnabled(origin) : false, holdMs: PQueue.HOLD_MS };
  },
  async "ply:save"(msg) {
    const draft = cleanDraft(msg.draft);
    if (!draft.text.trim()) return fail(new PErr("invalid", "empty"));
    if (draft.text.length > PVars.LIMITS.promptText) return fail(new PErr("invalid", "too_long"));
    try {
      const item = await PQueue.enqueue(draft);
      const auth = await PStore.get("auth");
      setTimeout(() => serial(flushNow), PQueue.HOLD_MS + 300);
      return { id: item.id, holdUntil: item.holdUntil, signedIn: Boolean(auth && auth.refreshToken), canWrite: PAuth.canWrite(auth) };
    } catch (e) { return fail(e); }
  },
  // Katmanın "gönderildi mi?" sorgusu: gönderilenlerde, sonra kuyrukta arar.
  async "ply:result"(msg) {
    const id = String(msg.id);
    const { sent, queue } = await PStore.getAll();
    const done = sent.find((x) => x.id === id);
    if (done) return { state: "sent", url: done.url, duplicate: done.duplicate, imageError: done.imageError };
    const q = queue.find((x) => x.id === id);
    if (!q) return { state: "gone" };
    if (q.state === "failed") return { state: "failed", error: q.error };
    const { lastError } = await PStore.getAll();
    return { state: "queued", reason: lastError ? { code: lastError.code, message: lastError.message } : null };
  },
  async "ply:undo"(msg) { return { undone: await PQueue.undo(String(msg.id)) }; },
  async "ply:flush"() { const r = await serial(flushNow); return { sent: r.sent, stopped: r.stopped }; },
  async "ply:library"(msg) {
    try { return await PLib.list(String(msg.source), { query: str(msg.query, 200), type: str(msg.type, 10) || "all", cursor: msg.cursor ? str(msg.cursor, 500) : null }); }
    catch (e) { return fail(e); }
  },
  async "ply:text"(msg) {
    const item = msg.item || {};
    try { return await PLib.text({ id: str(item.id, 64), source: str(item.source, 12), own: Boolean(item.own) }); } catch (e) { return fail(e); }
  },
  async "ply:used"(msg) { const i = msg.item || {}; await PLib.markUsed({ id: str(i.id, 64), title: str(i.title, 200), type: str(i.type, 10), source: str(i.source, 12), own: Boolean(i.own), url: str(i.url, 500), author: str(i.author, 60), description: str(i.description, 300), tools: [] }); return { ok: true }; },
  // popup/yan panel
  // Giriş burada çalışır: açılan giriş sekmesi/penceresi popup'ı kapatır (özellikle Android tarayıcılarda), popup'ta çalışan `connect()` sonucu yutulurdu.
  // Sonuç `storage` değişimiyle popup/yan panele yansır; akış uzun sürebilir, bu yüzden hizmet çalışanı canlı tutulur.
  async connect() {
    const keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20000);
    try {
      await PAuth.connect();
      await PApi.syncIdentity();
      serial(flushNow);
      return { ok: true };
    } catch (e) { return fail(e); }
    finally { clearInterval(keepAlive); }
  },
  async flush() { const r = await serial(flushNow); return { sent: r.sent, stopped: r.stopped }; },
  async "queue:retry"(msg) { await PQueue.retry(String(msg.id)); return serial(flushNow); },
  async "queue:retryAll"() { await PQueue.retryAll(); return serial(flushNow); },
  async "queue:remove"(msg) { await PQueue.remove(String(msg.id)); await updateBadge(); return { ok: true }; },
};
// Sayfaya enjekte edilen betiğin çağırabildikleri (depoya/hesaba dokunmayanlar + kendi kuyruk işlemleri)
const FROM_CONTENT = new Set(["ply:state", "ply:save", "ply:result", "ply:undo", "ply:flush", "ply:library", "ply:text", "ply:used"]);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || sender.id !== chrome.runtime.id || typeof msg.type !== "string") return false;
  const fromContent = Boolean(sender.tab) && !String(sender.url || "").startsWith(`chrome-extension://${chrome.runtime.id}/`);
  const handler = handlers[msg.type];
  if (!handler || (fromContent && !FROM_CONTENT.has(msg.type))) return false;
  handler(msg, sender).then(sendResponse, (e) => sendResponse(fail(e)));
  return true;
});
