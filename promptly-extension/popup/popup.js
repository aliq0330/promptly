// Popup (geniş görünüm): giriş (OAuth) → sabit sekmeler Ana Sayfa · Keşfet · Kütüphane + durum + yan panel + "/ ile aç".
// Liste, kart, süzgeç ve ayrıntı parçaları shared/browser.js'te; "Çalıştır" shared/run-ui.js + platforms.js'te. Tüm ağ işi paylaşılan modüllerdedir.
const $ = (id) => document.getElementById(id);
const t = PUI.t;
const KEYS = { save: "Alt+Shift+S", palette: "Alt+Shift+P" };
let data = null;
let tab = "home";
let home = null, discover = null, lib = null;
let started = {};
let activeOrigin = "";
let slashOn = false;

async function connectFlow() {
  const b = $("connect"); b.disabled = true; b.textContent = t("connecting");
  $("login-error").hidden = true;
  try {
    // Giriş arka planda yürür (giriş sekmesi açılınca popup kapanabilir); oturum açılınca depo değişimi arayüzü günceller.
    const res = await PUI.bg({ type: "connect" });
    if (res && res.error) throw res.error;
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

function renderBadge() {
  const n = data.queue.length;
  $("pend-n").hidden = n === 0; $("pend-n").textContent = n;
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
  renderStatus(); renderBadge(); renderFooter();
}

const openItem = (item, opts) => PBrowser.openDetail(item, { ...(opts || {}), onSlotsChange: () => lib && lib.repaint() });

function build() {
  started = {};
  PBrowser.closeDetail();
  home = PBrowser.createFeed({ mode: "home", host: $("tab-home"), open: openItem, getQuery: () => "" });
  discover = PBrowser.createFeed({ mode: "discover", host: $("tab-discover"), open: openItem, getQuery: () => $("search").value.trim() });
  lib = PBrowser.createLibraryView({ host: $("tab-library"), open: openItem, getQuery: () => $("search").value.trim(), getQueue: () => data.queue });
}

function setTab(name, { reload } = {}) {
  tab = name;
  PBrowser.closeDetail();
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
  for (const id of ["home", "discover", "library"]) $(`tab-${id}`).hidden = id !== name;
  const ctl = { home, discover, library: lib }[name];
  if (!started[name]) { started[name] = true; ctl.start(); } else if (reload && name === "discover") discover.reload();
}

function applySearch() {
  const q = $("search").value.trim();
  if (tab === "library") { lib.refilter(); return; }
  if (tab === "home") { if (q) setTab("discover", { reload: Boolean(started.discover) }); return; }
  discover.reload();
}

async function load() { data = await PStore.getAll(); }

async function init() {
  await PI.init();
  $("login-brand").innerHTML = PUI.brand(34); $("head-brand").innerHTML = PUI.brand(22); $("search-ico").innerHTML = PUI.icon("search");
  await Promise.all([load(), PRunUI.init(), PBrowser.loadEnv()]);
  PRunUI.targetSelect($("target"));
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (active && active.url) { const u = new URL(active.url); if (/^https?:$/.test(u.protocol)) activeOrigin = u.origin; }
  } catch { /* sekme okunamadı */ }
  slashOn = activeOrigin ? await PSlash.isEnabled(activeOrigin) : false;
  render();
  build();
  if (data.auth && data.auth.refreshToken) { setTab("home"); chrome.runtime.sendMessage({ type: "flush" }); }
}

document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
let searchTimer = null;
$("search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(applySearch, 300); });
$("connect").addEventListener("click", connectFlow);
const toggleLang = async () => { await PI.setLang(PI.getLang() === "tr" ? "en" : "tr"); };
$("lang").addEventListener("click", toggleLang);
$("lang-login").addEventListener("click", toggleLang);
$("account").addEventListener("click", () => { const m = $("menu"); m.hidden = !m.hidden; $("account").setAttribute("aria-expanded", String(!m.hidden)); });
$("signout").addEventListener("click", async () => { await PAuth.signOut(); $("menu").hidden = true; });
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

// Klavye: "/" aramaya odaklanır; 1–5 sabit slotu çalıştırır (yazma alanında ve değiştirici tuşla değil).
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  const tag = (e.target && e.target.tagName) || "";
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
  if (e.key === "/") { e.preventDefault(); $("search").focus(); return; }
  if (/^[1-5]$/.test(e.key) && lib && data && data.auth && data.auth.refreshToken && !document.querySelector(".detailpane")) { e.preventDefault(); lib.runSlot(Number(e.key) - 1); }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const wasSigned = Boolean(data && data.auth && data.auth.refreshToken);
  await load();
  const nowSigned = Boolean(data.auth && data.auth.refreshToken);
  if (changes.lang) await PI.init();
  if (changes.slots || changes.views || changes.prefs) await PBrowser.loadEnv();
  if (changes.auth || changes.queue || changes.lastError || changes.lang || changes.sent) render();
  if (wasSigned !== nowSigned || changes.lang) {
    build();
    if (nowSigned) setTab(tab);
    return;
  }
  if (!nowSigned) return;
  if ((changes.queue || changes.slots) && started.library) lib.repaint();
  if (changes.views || changes.prefs) { if (started.home) home.repaint(); if (started.discover) discover.repaint(); if (started.library) lib.repaint(); }
  if (changes.recent) { if (started.home) home.repaint(); if (started.library) lib.reloadCurrent(); }
  if (changes.sent && started.library) lib.reloadCurrent();
});

init();
