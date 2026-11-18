// Popup: giriş (OAuth taslağı) → kütüphane / taslaklar / bekleyen. Yazma işlemleri PStore üzerinden, ağ yok.
const $ = (id) => document.getElementById(id);
const t = PUI.t;
const view = { tab: "library", type: "all", query: "", open: null };
let data = null;

const KEYS = { save: "Alt+Shift+S", palette: "Alt+Shift+P" };

async function load() { data = await PStore.getAll(); }

function renderTypes() {
  const box = $("types"); box.replaceChildren();
  for (const k of ["all", "image", "text", "audio", "video"]) {
    const b = PUI.el("button", "chip" + (view.type === k ? " on" : ""), t(k === "all" ? "typeAll" : PUI.typeKey[k]));
    b.type = "button";
    b.addEventListener("click", () => { view.type = k; render(); });
    box.append(b);
  }
}

function renderBanner() {
  const b = $("banner");
  const n = data.pending.length;
  if (!n) { b.hidden = true; return; }
  b.hidden = false;
  b.replaceChildren();
  b.insertAdjacentHTML("beforeend", PUI.icon(data.online ? "link" : "wifi"));
  b.append(PUI.el("span", "", t(data.session ? "pendingBannerOffline" : "pendingBannerSignedOut", { n })));
}

function render() {
  const signed = Boolean(data.session);
  $("login").hidden = signed;
  $("app").hidden = !signed;
  PUI.applyLang();
  $("lang").textContent = PI.getLang() === "tr" ? "EN" : "TR";
  if (!signed) return;

  renderBanner();
  $("offline").checked = !data.online;
  $("pend-n").hidden = data.pending.length === 0;
  $("pend-n").textContent = data.pending.length;
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === view.tab));
  $("searchbox").hidden = view.tab !== "library";
  $("types").hidden = view.tab !== "library";
  renderTypes();
  $("shortcuts").innerHTML = "";
  const sc = t("shortcutHint", { k1: "§1", k2: "§2" });
  const [a, rest] = sc.split("§1"); const [b2, c] = rest.split("§2");
  $("shortcuts").append(a, PUI.el("kbd", "", KEYS.save), b2, PUI.el("kbd", "", KEYS.palette), c);
  $("sidepanel").innerHTML = PUI.icon("panel") + "<span></span>";
  $("sidepanel").lastChild.textContent = t("openSidePanel");

  const list = $("list"); list.replaceChildren();
  let empty = "";
  if (view.tab === "library") {
    const items = PUI.filterLibrary(data.library, view.query, view.type);
    items.forEach((p) => list.append(PUI.libraryRow(p, view, render)));
    if (!items.length) empty = t("noResults");
  } else if (view.tab === "drafts") {
    data.drafts.forEach((d) => list.append(PUI.draftRow(d, "draft")));
    if (!data.drafts.length) empty = t("noDrafts");
  } else {
    data.pending.forEach((d) => list.append(PUI.draftRow(d, "pending")));
    if (data.pending.length && data.online) {
      const li = PUI.el("li");
      const b = PUI.el("button", "btn sm full", t("sendNow")); b.type = "button";
      b.addEventListener("click", () => PStore.flushPending());
      li.append(b); list.append(li);
    }
    if (!data.pending.length) empty = t("noPending");
  }
  $("empty").hidden = !empty;
  $("empty").textContent = empty;
}

document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.addEventListener("click", () => { view.tab = b.dataset.tab; view.open = null; render(); }));
$("search").addEventListener("input", (e) => { view.query = e.target.value; view.open = null; render(); });
$("lang").addEventListener("click", async () => { await PI.setLang(PI.getLang() === "tr" ? "en" : "tr"); render(); });
$("signout").addEventListener("click", async () => { await PStore.set({ session: null }); });
$("offline").addEventListener("change", async (e) => { await PStore.set({ online: !e.target.checked }); });
$("sidepanel").addEventListener("click", async () => {
  const win = await chrome.windows.getCurrent();
  try { await chrome.sidePanel.open({ windowId: win.id }); window.close(); } catch (err) { PUI.toast(String(err.message || err)); }
});
$("connect").addEventListener("click", async () => {
  const b = $("connect"); b.disabled = true; b.textContent = t("connecting");
  await new Promise((r) => setTimeout(r, 900)); // gerçek sürümde: chrome.identity.launchWebAuthFlow + PKCE
  await PStore.set({ session: { username: "aliq" } });
  b.disabled = false; b.textContent = t("connectBtn");
});

chrome.storage.onChanged.addListener(async (_c, area) => { if (area === "local") { await load(); render(); } });

(async function init() {
  await PI.init();
  await PStore.seed();
  $("login-brand").innerHTML = PUI.brand(34);
  $("head-brand").innerHTML = PUI.brand(22);
  $("search-ico").innerHTML = PUI.icon("search");
  await load();
  render();
})();
