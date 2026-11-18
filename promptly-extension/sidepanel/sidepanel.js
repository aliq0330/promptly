// Yan panel: "Şimdi" (durum + son kullandığın + oy/sonuç için siteye bağlantı + bekleyenler), kütüphane, taslaklar.
// "Çalıştı mı?" oyu ve sonuç paylaşımı sitede yapılır: açık API'de bu yazma yetenekleri yoktur (kişisel anahtar yalnız özel taslak yazar).
const $ = (id) => document.getElementById(id);
const t = PUI.t;
let data = null, tab = "now", libCtl = null, draftsCtl = null;
let loaded = { library: false, drafts: false };

async function connectFlow() {
  const b = $("connect"); b.disabled = true; b.textContent = t("connecting"); $("login-error").hidden = true;
  try { await PAuth.connect(); await PApi.syncIdentity(); chrome.runtime.sendMessage({ type: "flush" }); }
  catch (err) { $("login-error").hidden = false; $("login-error").textContent = err && err.code === "cancelled" ? t("connectCancelled") : t("connectFailed", { error: PUI.errText(err) }); }
  finally { b.disabled = false; b.textContent = t("connectBtn"); }
}

function renderNow() {
  const used = $("used"); used.replaceChildren();
  const last = data.recent[0];
  $("usedActions").hidden = !last;
  if (!last) {
    const p = PUI.el("p", "empty");
    const [a, b] = t("nothingUsed", { k: "§" }).split("§");
    p.append(a, PUI.el("kbd", "", "Alt+Shift+P"), b);
    used.append(p);
  } else {
    const li = PUI.el("div", "row");
    const tile = PUI.el("span", "tile"); tile.innerHTML = PUI.icon(last.type);
    const main = PUI.el("div", "main");
    main.append(PUI.el("span", "t", last.title));
    const m = PUI.el("span", "m"); m.append(PUI.el("span", "pill", t(PUI.typeKey[last.type] || "typeText")), PUI.el("span", "", t("usedAt", { when: PI.when(last.at) })));
    main.append(m);
    li.append(tile, main); used.append(li);
    const link = $("voteLink"); link.href = PUI.itemHref(last); link.textContent = t("voteOnSite");
  }
  const q = data.queue;
  $("pendingBox").hidden = q.length === 0;
  const list = $("pending-list"); list.replaceChildren(); q.forEach((it) => list.append(PUI.queueRow(it)));
}

function renderStatus() {
  const s = PQueue.statusOf({ auth: data.auth, queue: data.queue, lastError: data.lastError });
  PUI.renderStatus($("status"), s, { lastError: data.lastError, user: data.auth && data.auth.user && data.auth.user.username, showOk: true, onReconnect: connectFlow, onRetry: () => chrome.runtime.sendMessage({ type: "flush" }) });
}

function showTab() {
  document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
  for (const id of ["now", "library", "drafts"]) $(`tab-${id}`).hidden = id !== tab;
  if (tab === "library" && !loaded.library) { loaded.library = true; libCtl.load(true); }
  if (tab === "drafts" && !loaded.drafts) { loaded.drafts = true; draftsCtl.load(true); }
}

function render() {
  const signed = Boolean(data.auth && data.auth.refreshToken);
  $("signedout").hidden = signed; $("signedin").hidden = !signed;
  PUI.applyLang();
  $("lang").textContent = PI.getLang() === "tr" ? "EN" : "TR";
  if (!signed) return;
  renderStatus(); renderNow(); showTab();
}

document.querySelectorAll("#tabs [data-tab]").forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; showTab(); }));
$("connect").addEventListener("click", connectFlow);
$("lang").addEventListener("click", async () => { await PI.setLang(PI.getLang() === "tr" ? "en" : "tr"); render(); libCtl.render(); draftsCtl.render(); });

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local") return;
  const was = Boolean(data.auth && data.auth.refreshToken);
  data = await PStore.getAll();
  if (was !== Boolean(data.auth && data.auth.refreshToken)) loaded = { library: false, drafts: false };
  if (changes.lang) await PI.init();
  render();
  if (changes.recent && libCtl.state.source === "recent") libCtl.load(true);
  if (changes.sent && loaded.drafts) draftsCtl.load(true);
});

(async function init() {
  await PI.init();
  $("head-brand").innerHTML = PUI.brand(22); $("search-ico").innerHTML = PUI.icon("search");
  data = await PStore.getAll();
  libCtl = PUI.createLibrary({ sourcesEl: $("sources"), typesEl: $("types"), searchEl: $("search"), listEl: $("lib-list"), noteEl: $("lib-note"), sources: ["recent", "mine", "saved", "popular", "explore"], source: data.recent.length ? "recent" : "mine" });
  draftsCtl = PUI.createLibrary({ listEl: $("drafts-list"), sources: ["drafts"], source: "drafts" });
  render();
})();
