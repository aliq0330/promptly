// Popup: giriş (OAuth) → kütüphane / taslaklar / bekleyen + durum + yan panel + "/ ile aç". Tüm ağ işi paylaşılan modüllerdedir.
const $ = (id) => document.getElementById(id);
const t = PUI.t;
const KEYS = { save: "Alt+Shift+S", palette: "Alt+Shift+P" };
let data = null;
let tab = "library";
let libCtl = null, draftsCtl = null;
let activeOrigin = "";
let slashOn = false;
let loadedTab = { library: false, drafts: false };

async function connectFlow() {
  const b = $("connect"); b.disabled = true; b.textContent = t("connecting");
  $("login-error").hidden = true;
  try {
    await PAuth.connect();
    await PApi.syncIdentity();
    chrome.runtime.sendMessage({ type: "flush" });
  } catch (err) {
    if (err && err.code !== "cancelled") { $("login-error").hidden = false; $("login-error").textContent = t("connectFailed", { error: PUI.errText(err) }); }
    else if (err) { $("login-error").hidden = false; $("login-error").textContent = t("connectCancelled"); }
  } finally { b.disabled = false; b.textContent = t("connectBtn"); }
}

function status() { return PQueue.statusOf({ auth: data.auth, queue: data.queue, lastError: data.lastError }); }

function renderStatus() {
  const s = status();
  PUI.renderStatus($("status"), s, {
    lastError: data.lastError, user: data.auth && data.auth.user && data.auth.user.username,
    onReconnect: connectFlow,
    onRetry: () => chrome.runtime.sendMessage({ type: "flush" }),
  });
}

function renderPending() {
  const list = $("pending-list"); list.replaceChildren();
  data.queue.forEach((q) => list.append(PUI.queueRow(q)));
  $("pending-empty").hidden = data.queue.length > 0;
  const n = data.queue.length;
  $("pend-n").hidden = n === 0; $("pend-n").textContent = n;
}

function showTab() {
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  for (const id of ["library", "drafts", "pending"]) $(`tab-${id}`).hidden = id !== tab;
  if (tab === "library" && !loadedTab.library) { loadedTab.library = true; libCtl.load(true); }
  if (tab === "drafts" && !loadedTab.drafts) { loadedTab.drafts = true; draftsCtl.load(true); }
}

function renderFooter() {
  const sc = $("shortcuts"); sc.replaceChildren();
  const [a, rest] = t("shortcutHint", { k1: "§1", k2: "§2" }).split("§1"); const [b2, c] = rest.split("§2");
  sc.append(a, PUI.el("kbd", "", KEYS.save), b2, PUI.el("kbd", "", KEYS.palette), c);
  $("sidepanel").innerHTML = PUI.icon("panel") + "<span></span>"; $("sidepanel").lastChild.textContent = t("openSidePanel");
  const sb = $("slash");
  sb.disabled = !PSlash.okOrigin(activeOrigin);
  sb.textContent = !PSlash.okOrigin(activeOrigin) ? t("slashNeedPage") : slashOn ? `${t("slashOn")} · ${t("remove")}` : t("slashHere");
  $("slash-hint").hidden = !PSlash.okOrigin(activeOrigin);
}

function render() {
  const signed = Boolean(data.auth && data.auth.refreshToken);
  $("login").hidden = signed; $("app").hidden = !signed;
  PUI.applyLang();
  const langLabel = PI.getLang() === "tr" ? "EN" : "TR";
  $("lang").textContent = langLabel; $("lang-login").textContent = langLabel;
  if (!signed) return;
  const user = (data.auth.user && data.auth.user.username) || "";
  $("account").textContent = (user || "P").slice(0, 2).toUpperCase();
  $("menu-user").textContent = user ? `@${user}` : "";
  renderStatus(); renderPending(); renderFooter(); showTab();
}

async function load() { data = await PStore.getAll(); }

async function init() {
  await PI.init();
  $("login-brand").innerHTML = PUI.brand(34); $("head-brand").innerHTML = PUI.brand(22); $("search-ico").innerHTML = PUI.icon("search");
  await load();
  const recentFirst = data.recent.length > 0;
  libCtl = PUI.createLibrary({ sourcesEl: $("sources"), typesEl: $("types"), searchEl: $("search"), listEl: $("lib-list"), noteEl: $("lib-note"), sources: ["recent", "mine", "saved", "popular", "explore"], source: recentFirst ? "recent" : "mine" });
  draftsCtl = PUI.createLibrary({ listEl: $("drafts-list"), sources: ["drafts"], source: "drafts" });
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active && active.url) { const u = new URL(active.url); if (/^https?:$/.test(u.protocol)) activeOrigin = u.origin; }
  } catch { /* sekme okunamadı */ }
  slashOn = activeOrigin ? await PSlash.isEnabled(activeOrigin) : false;
  render();
  if (data.auth && data.auth.refreshToken) chrome.runtime.sendMessage({ type: "flush" });
}

document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; showTab(); }));
$("connect").addEventListener("click", connectFlow);
const toggleLang = async () => { await PI.setLang(PI.getLang() === "tr" ? "en" : "tr"); render(); libCtl && libCtl.render(); draftsCtl && draftsCtl.render(); };
$("lang").addEventListener("click", toggleLang);
$("lang-login").addEventListener("click", toggleLang);
$("account").addEventListener("click", () => { const m = $("menu"); m.hidden = !m.hidden; $("account").setAttribute("aria-expanded", String(!m.hidden)); });
$("signout").addEventListener("click", async () => { await PAuth.signOut(); $("menu").hidden = true; loadedTab = { library: false, drafts: false }; });
$("sidepanel").addEventListener("click", async () => {
  const win = await chrome.windows.getCurrent();
  try { await chrome.sidePanel.open({ windowId: win.id }); window.close(); } catch (err) { PUI.toast(String((err && err.message) || err)); }
});
$("slash").addEventListener("click", async () => {
  if (!PSlash.okOrigin(activeOrigin)) return;
  try {
    if (slashOn) { await PSlash.disable(activeOrigin); slashOn = false; }
    else { const ok = await PSlash.enable(activeOrigin); if (!ok) { PUI.toast(t("slashDenied")); return; } slashOn = true; }
  } catch (err) { PUI.toast(PUI.errText(err)); }
  renderFooter();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const wasSigned = Boolean(data && data.auth && data.auth.refreshToken);
  await load();
  const nowSigned = Boolean(data.auth && data.auth.refreshToken);
  if (changes.lang) { await PI.init(); }
  if (wasSigned !== nowSigned) { loadedTab = { library: false, drafts: false }; }
  if (changes.auth || changes.queue || changes.lastError || changes.lang || changes.sent) render();
  if (changes.recent && libCtl && libCtl.state.source === "recent") libCtl.load(true);
  if (changes.sent && loadedTab.drafts) draftsCtl.load(true);
});

init();
