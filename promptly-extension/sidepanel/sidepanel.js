// Yan panel: "Şimdi" (durum + son kullandığın + oy/sonuç için siteye bağlantı + bekleyenler), kütüphane, taslaklar.
// "Çalıştı mı?" oyu ve sonuç paylaşımı sitede yapılır: açık API'de bu yazma yetenekleri yoktur (kişisel anahtar yalnız özel taslak yazar).
const $ = (id) => document.getElementById(id);
const t = PUI.t;
let data = null, tab = "now", libCtl = null, draftsCtl = null;
let loaded = { library: false, drafts: false };

async function connectFlow() {
  const b = $("connect"); b.disabled = true; b.textContent = t("connecting"); $("login-error").hidden = true;
  try { const res = await PUI.bg({ type: "connect" }); if (res && res.error) throw res.error; }
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
  for (const id of ["now", "library", "drafts", "workflow"]) $(`tab-${id}`).hidden = id !== tab;
  if (tab === "library" && !loaded.library) { loaded.library = true; libCtl.load(true); }
  if (tab === "drafts" && !loaded.drafts) { loaded.drafts = true; draftsCtl.load(true); }
  if (tab === "workflow") renderWorkflow();
}

function render() {
  const signed = Boolean(data.auth && data.auth.refreshToken);
  $("signedout").hidden = signed; $("signedin").hidden = !signed;
  PUI.applyLang();
  $("lang").textContent = PI.getLang() === "tr" ? "EN" : "TR";
  if (!signed) return;
  renderStatus(); renderNow(); showTab();
  renderContext();
}

// ---- Sayfa bağlamı: açık sekme bir yapay zekâ sitesi mi? Seçili metin, uygun promptlar. İzin yokken hiçbir sekmenin adresi okunmaz. ----
let ctxSig = "", useSel = true;
const ctxSuggest = new Map(); // araç kimliği → prompt listesi (bu oturumda bir kez)

async function suggestionsFor(platform) {
  if (ctxSuggest.has(platform.tool)) return ctxSuggest.get(platform.tool);
  try {
    const res = await PLib.list("explore", { type: "text", tools: [platform.tool], sort: "popular" });
    ctxSuggest.set(platform.tool, res.items);
    return res.items;
  } catch { return []; }
}

function paintSuggestions(box, c, items) {
  box.replaceChildren();
  const list = items.slice().sort((a, b) => Number(PBrowse.usesSelection(b.variableNames)) - Number(PBrowse.usesSelection(a.variableNames))).slice(0, 4);
  if (!list.length) { box.append(PUI.el("p", "hint", t("ctxNoSuggest"))); return; }
  for (const it of list) {
    const row = PUI.el("div", "row");
    const main = PUI.el("div", "main");
    main.append(PUI.el("span", "t", it.title));
    const m = PUI.el("span", "m"); m.append(PUI.el("span", "pill", t(PUI.typeKey[it.type] || "typeText")));
    if (PBrowse.usesSelection(it.variableNames)) m.append(PUI.el("span", "vchip", "{" + (it.variableNames.find((n) => PBrowse.SELECTION_VARS.includes(String(n).toLowerCase())) || "seçim") + "}"));
    if (it.author) m.append(PUI.el("span", "", t("byAuthor", { a: it.author })));
    main.append(m);
    const sel = useSel ? c.selection : "";
    const go = PUI.btn("btn sm pri", t("ctxWrite"), async () => {
      const r = await PRunUI.runItem(it, { selection: sel, platformId: c.platform.id });
      if (r && r.needVars) PBrowser.openDetail(it, { selection: sel });
    });
    row.append(main, go); box.append(row);
  }
}

async function renderContext() {
  const box = $("ctx");
  if (!box || $("signedin").hidden) return;
  let c;
  try { c = await PContext.read(); } catch { c = { granted: false, platform: null, selection: "", tab: null }; }
  const sig = [c.granted, c.platform && c.platform.id, c.selection, useSel].join("|");
  if (sig === ctxSig) return;
  ctxSig = sig;
  box.replaceChildren();
  const card = PUI.el("div", "ctxcard");
  if (!c.granted) {
    card.append(PUI.el("div", "label", t("ctxEnableTitle")), PUI.el("p", "hint", t("ctxEnableNote")));
    card.append(PUI.btn("btn sm pri", t("ctxEnableBtn"), async () => { const ok = await PContext.enable(); if (!ok) PUI.toast(t("slashDenied")); ctxSig = ""; renderContext(); }));
    box.append(card); return;
  }
  if (!c.platform) {
    card.append(PUI.el("p", "hint", t("ctxNoSite")), PUI.btn("linkbtn", t("ctxDisableBtn"), async () => { await PContext.disable(); ctxSig = ""; renderContext(); }));
    box.append(card); return;
  }
  const ban = PUI.el("div", "banner ok");
  const body = PUI.el("div", "grow");
  body.append(PUI.el("strong", "", t("ctxOn", { name: c.platform.name })), PUI.el("div", "", t("ctxFilter", { tool: c.platform.name })));
  ban.append(body, PUI.btn("linkbtn", t("ctxDisableBtn"), async () => { await PContext.disable(); ctxSig = ""; renderContext(); }));
  box.append(ban);

  const selCard = PUI.el("div", "ctxcard");
  const head = PUI.el("div", "ctxhead"); head.append(PUI.el("span", "label", t("ctxSelectionTitle")));
  if (c.selection) head.append(PUI.el("span", "hint", t("ctxChars", { n: c.selection.length })));
  selCard.append(head);
  if (c.selection) {
    selCard.append(PUI.el("blockquote", "quote", c.selection));
    const l = PUI.el("label", "chk"); const cb = PUI.el("input"); cb.type = "checkbox"; cb.checked = useSel;
    cb.addEventListener("change", () => { useSel = cb.checked; ctxSig = ""; renderContext(); });
    l.append(cb, document.createTextNode(t("ctxUseSelection"))); selCard.append(l);
    selCard.append(PUI.btn("btn sm", t("ctxCapture"), async () => {
      const res = await PUI.bg({ type: "ply:save", draft: { text: c.selection, type: "text", origin: "external", sourceUrl: c.tab ? c.tab.url : "", sourceTitle: c.tab ? c.tab.title : "" } });
      PUI.toast(res && res.error ? PUI.errText(res.error) : t("ctxCaptured"));
    }));
  } else selCard.append(PUI.el("p", "hint", t("ctxSelectionNone")));
  box.append(selCard);

  const sug = PUI.el("div", "ctxcard");
  sug.append(PUI.el("div", "label", t("ctxSuggestions")));
  const list = PUI.el("div", "stack"); list.append(PUI.el("p", "hint", t("loading"))); sug.append(list);
  box.append(sug);
  suggestionsFor(c.platform).then((items) => { if (list.isConnected) paintSuggestions(list, c, items); });
}

let ctxTimer = null;
function startContext() {
  clearInterval(ctxTimer);
  ctxTimer = setInterval(() => { if (!document.hidden) renderContext(); }, 2000);
  for (const ev of [chrome.tabs.onActivated, chrome.tabs.onUpdated]) { try { ev.addListener(() => { clearTimeout(startContext.deb); startContext.deb = setTimeout(renderContext, 250); }); } catch { /* olay yok */ } }
}


// ---- Workflow adım adım: bir adımın çıktısı sonrakinin girdisi olur. Hiçbir adım otomatik gönderilmez. ----
let wfQuery = "", wfList = null, wfBusy = false;
// Çıktı kutusuna yazılan metin: panel her depo değişiminde (ör. "son kullanılan") yeniden çizilir; yazılan metin kaybolmasın. Adım/kapatma değişince sıfırlanır.
let wfDraft = null;

async function wfSearch() {
  try { const res = await PApi.workflows({ q: wfQuery || undefined, limit: 20 }); wfList = res.items || []; } catch (err) { wfList = { error: err }; }
  renderWorkflow();
}

async function wfBegin(id) {
  if (wfBusy) return; wfBusy = true;
  try {
    const detail = await PApi.workflow(id);
    const st = PWorkflow.start(detail);
    if (!st) { PUI.toast(t("wfEmpty")); return; }
    wfDraft = null;
    await PStore.set({ wf: st });
  } catch (err) { PUI.toast(PUI.errText(err)); } finally { wfBusy = false; }
}

async function renderWorkflow() {
  const box = $("tab-workflow");
  if (!box || box.hidden) return;
  const st = PWorkflow.clean((await PStore.get("wf")));
  box.replaceChildren();
  if (!st) {
    const f = PUI.el("label", "field"); const inp = PUI.el("input"); inp.type = "search"; inp.value = wfQuery; inp.placeholder = t("wfSearchPh"); inp.autocomplete = "off";
    let timer = null; inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { wfQuery = inp.value.trim(); wfSearch(); }, 300); });
    f.append(inp); box.append(f);
    if (wfList === null) { wfSearch(); box.append(PUI.el("p", "hint", t("loading"))); return; }
    if (wfList.error) { box.append(PUI.el("p", "hint", t("loadFailed", { error: PUI.errText(wfList.error) }))); return; }
    if (!wfList.length) box.append(PUI.el("p", "empty", t("wfEmpty")));
    for (const w of wfList) {
      const row = PUI.el("div", "row"); const main = PUI.el("div", "main");
      main.append(PUI.el("span", "t", w.title));
      const m = PUI.el("span", "m"); m.append(PUI.el("span", "pill", t("wfSteps", { n: w.stepCount || 0 })));
      if (w.author && w.author.username) m.append(PUI.el("span", "", t("byAuthor", { a: w.author.username })));
      main.append(m); row.append(main, PUI.btn("btn sm pri", t("wfStart"), () => wfBegin(w.id))); box.append(row);
    }
    return;
  }
  const head = PUI.el("div", "ctxhead"); head.append(PUI.el("strong", "", st.title), PUI.btn("linkbtn", t("wfClose"), async () => { wfDraft = null; await PStore.set({ wf: null }); wfList = null; }));
  box.append(head);
  const bars = PUI.el("div", "wfbars");
  st.steps.forEach((_, i) => bars.append(PUI.el("span", "wfbar" + (i < st.index ? " done" : i === st.index ? " now" : ""))));
  box.append(bars);
  if (PWorkflow.isDone(st)) {
    box.append(PUI.el("div", "banner ok", t("wfDone")));
    const acts = PUI.el("div", "actions-row"); acts.append(PUI.btn("btn sm", t("wfBack"), () => { wfDraft = null; PStore.set({ wf: PWorkflow.back(st) }); }));
    if (st.url) acts.append(PUI.anchor(st.url, t("wfOpenSite")));
    box.append(acts); return;
  }
  const step = PWorkflow.current(st);
  const card = PUI.el("div", "ctxcard");
  card.append(PUI.el("span", "label", t("wfStepOf", { n: st.index + 1, total: st.steps.length })), PUI.el("div", "t", step.title || ""));
  const text = [step.description, step.instructions].filter(Boolean).join("\n\n");
  if (text) card.append(PUI.el("p", "hint wfinstr", text));
  const out = PUI.el("textarea", "in wfout"); out.rows = 4; out.value = wfDraft !== null ? wfDraft : st.carry || ""; out.setAttribute("aria-label", t("wfCarry"));
  out.addEventListener("input", () => { wfDraft = out.value; });
  if (step.promptId) {
    const item = { id: step.promptId, title: step.promptTitle || step.title, type: "text", source: "explore", own: false, url: "", author: "", description: "" };
    card.append(PUI.el("span", "label", step.promptTitle || ""));
    const acts = PUI.el("div", "actions-row");
    acts.append(PRunUI.splitButton(async (id) => { const r = await PRunUI.runItem(item, { selection: out.value, platformId: id }); if (r && r.needVars) PBrowser.openDetail(item, { selection: out.value }); }, { small: true }));
    card.append(acts);
  } else {
    card.append(PUI.el("p", "hint", t("wfNoPrompt")));
    card.append(PUI.btn("btn sm", t("wfCopyInstr"), async () => { const ok = await PUI.copyText(text); PUI.toast(t(ok ? "copied" : "copyFailed")); }));
  }
  card.append(PUI.el("span", "label", t("wfCarry")), out);
  card.append(PUI.btn("linkbtn", t("wfGrab"), async () => { const c = await PContext.read().catch(() => null); if (c && c.selection) out.value = c.selection; else PUI.toast(t("ctxSelectionNone")); }));
  box.append(card);
  const nav = PUI.el("div", "actions-row");
  nav.append(PUI.btn("btn sm", t("wfBack"), () => { wfDraft = null; PStore.set({ wf: PWorkflow.back(st) }); }));
  const last = st.index === st.steps.length - 1;
  nav.append(PUI.btn("btn sm pri", t(last ? "wfFinish" : "wfNext"), () => { const next = PWorkflow.advance(st, out.value); wfDraft = null; PStore.set({ wf: next }); }));
  box.append(nav);
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
  if (changes.wf) renderWorkflow();
  if (changes.recent && libCtl.state.source === "recent") libCtl.load(true);
  if (changes.sent && loaded.drafts) draftsCtl.load(true);
});

(async function init() {
  await PI.init();
  $("head-brand").innerHTML = PUI.brand(22); $("search-ico").innerHTML = PUI.icon("search");
  data = await PStore.getAll();
  await Promise.all([PRunUI.init(), PBrowser.loadEnv()]);
  startContext();
  libCtl = PUI.createLibrary({ sourcesEl: $("sources"), typesEl: $("types"), searchEl: $("search"), listEl: $("lib-list"), noteEl: $("lib-note"), sources: ["recent", "mine", "saved", "popular", "explore"], source: data.recent.length ? "recent" : "mine" });
  draftsCtl = PUI.createLibrary({ listEl: $("drafts-list"), sources: ["drafts"], source: "drafts" });
  render();
})();
