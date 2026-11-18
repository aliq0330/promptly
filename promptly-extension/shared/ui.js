// Promptly uzantısı — popup ve yan panelin ortak arayüz parçaları: ikonlar, marka, durum bandı, kuyruk satırı ve KÜTÜPHANE görünümü.
// Kütüphane görünümü tek yerde (`createLibrary`): kaynak çipleri, tür süzgeci, arama, sayfalama, açılır prompt satırı, değişken doldurma.
self.PUI = (() => {
  const t = (k, p) => PI.t(k, p);
  const PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>',
    text: '<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',
    audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    wifi: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 3-2M2 8.8a15 15 0 0 1 5-3M12 20h.01"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
    alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>',
    external: '<path d="M7 17 17 7M9 7h8v8"/>',
    play: '<path d="M7 4.5v15l13-7.5z"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h10M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    pin: '<path d="M12 17v5M8 3h8l-1 7 3 3H6l3-3z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${PATHS[n] || ""}</svg>`;
  const brand = (size = 24) => `<svg width="${size}" height="${size}" viewBox="8 8 48 48" aria-hidden="true"><g fill="none" stroke="var(--primary)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8"/><path d="M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8"/></g><path d="M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z" fill="var(--heart)" stroke="var(--heart)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (cls, text, onClick) => { const b = el("button", cls, text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; };
  const typeKey = { image: "typeImage", text: "typeText", audio: "typeAudio", video: "typeVideo" };
  const siteUrl = () => self.PROMPTLY_CONFIG.siteUrl;
  const editHref = (id) => `${siteUrl()}/create/?edit=${encodeURIComponent(id)}`;
  const itemHref = (item) => (item.source === "drafts" || item.status === "draft" ? editHref(item.id) : item.url || siteUrl());
  const openTab = (url) => chrome.tabs.create({ url });
  const anchor = (href, text, cls) => { const a = el("a", cls || "linkbtn", text); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; return a; };

  // Metni `node`'a yazar: JSON/YAML biçimliyse renklendirir; {değişken} jetonları her yerde vurgulanır. Metin DEĞİŞMEZ (yalnız gösterim).
  function appendWithVars(node, text, cls) {
    let last = 0;
    const put = (s, c) => { if (!s) return; if (c) node.append(el("span", c, s)); else node.append(s); };
    for (const m of text.matchAll(PVars.VAR_RE)) { put(text.slice(last, m.index), cls); node.append(el("span", "var", m[0])); last = m.index + m[0].length; }
    put(text.slice(last), cls);
  }
  function writePrompt(node, text) {
    node.replaceChildren();
    const kind = self.PStructured ? PStructured.detect(text) : null;
    node.classList.toggle("structured", Boolean(kind));
    if (kind) { for (const tk of PStructured.tokens(text, kind)) appendWithVars(node, tk.v, tk.k === "text" ? "" : `tk-${tk.k}`); return; }
    let last = 0;
    for (const m of text.matchAll(PVars.VAR_RE)) {
      node.append(text.slice(last, m.index));
      node.append(el("span", "var", m[0]));
      last = m.index + m[0].length;
    }
    node.append(text.slice(last));
  }
  async function copyText(text) { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } }
  function toast(msg) {
    document.querySelectorAll(".toast").forEach((n) => n.remove());
    const n = el("div", "toast", msg); n.setAttribute("role", "status");
    document.body.append(n);
    setTimeout(() => n.remove(), 2200);
  }
  function errText(err) {
    const c = err && err.code;
    if (c === "offline") return t("errOffline");
    if (c === "unauthorized") return t("errUnauthorized");
    if (c === "insufficient_scope") return t("errScope");
    if (c === "rate_limited") return t("errRate");
    if (c === "server") return t("errServer");
    if (c === "invalid") return t("errInvalid", { detail: [fieldName(err.field), err.detail].filter(Boolean).join(" · ") || (err.message || "") });
    return (err && err.message) || t("errGeneric");
  }
  function fieldName(f) {
    return ({ title: t("fieldTitle"), promptText: t("fieldPromptText"), tools: t("fieldTools"), tags: t("fieldTags") })[f] || (f ? t("fieldOther") : "");
  }
  async function applyLang(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
    root.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-title]").forEach((n) => { n.title = t(n.dataset.i18nTitle); n.setAttribute("aria-label", t(n.dataset.i18nTitle)); });
    document.documentElement.lang = PI.getLang();
  }
  const bg = (msg) => chrome.runtime.sendMessage(msg);

  // ---- Durum bandı (oturum / yazma izni / ağ / sorun / bekleyen) ----
  function renderStatus(node, status, extra = {}) {
    node.replaceChildren();
    node.hidden = status.kind === "ok" && !extra.showOk;
    if (node.hidden) return;
    const tone = status.kind === "ok" ? "ok" : status.kind === "pending" ? "info" : "";
    node.className = "banner" + (tone ? " " + tone : "");
    const ic = el("span"); ic.innerHTML = icon(status.kind === "offline" ? "wifi" : status.kind === "ok" || status.kind === "pending" ? "link" : "alert");
    const body = el("div", "grow");
    const lines = {
      signedOut: t("statusSignedOut"), offline: `${t("statusOffline")} · ${t("errOffline")}`, needsWrite: t("errScope"),
      error: extra.lastError ? errText(extra.lastError) : t("statusError"), pending: t("statusPending", { n: status.n }), ok: extra.user ? t("statusAs", { user: extra.user }) : t("statusOkLine"),
    };
    body.append(el("span", "", lines[status.kind] || ""));
    const actions = el("div", "banner-actions");
    if (status.kind === "needsWrite" && extra.onReconnect) actions.append(btn("linkbtn", t("reconnect"), extra.onReconnect));
    if ((status.kind === "error" || status.kind === "offline" || status.kind === "pending") && extra.onRetry) actions.append(btn("linkbtn", status.kind === "pending" ? t("sendNow") : t("retry"), extra.onRetry));
    if (actions.childNodes.length) body.append(actions);
    node.append(ic, body);
  }

  // ---- Kuyruk satırı (Bekleyen sekmesi) ----
  function queueRow(item) {
    const li = el("li", "row");
    const tile = el("span", "tile"); tile.innerHTML = icon(item.state === "failed" ? "alert" : item.draft.type || "text");
    const main = el("div", "main");
    main.append(el("span", "t", item.draft.title || PVars.guessTitle(item.draft.text)));
    const meta = el("span", "m");
    if (item.state === "failed") {
      meta.append(el("span", "pill warn", t("failedItem")));
      const e = item.error || {};
      main.append(meta, el("span", "hint", errText({ code: e.code, message: e.message, field: e.field, detail: e.detail })));
      const row = el("div", "actions-row");
      row.append(btn("linkbtn", t("retry"), () => bg({ type: "queue:retry", id: item.id })));
      main.append(row);
    } else {
      meta.append(el("span", "pill warn", t("waitingSince", { when: PI.when(item.createdAt) })));
      if (item.draft.origin === "external") meta.append(el("span", "", t("external")));
      main.append(meta);
    }
    const rm = btn("ico", "", () => bg({ type: "queue:remove", id: item.id })); rm.innerHTML = icon("x");
    rm.title = t("remove"); rm.setAttribute("aria-label", `${t("remove")}: ${item.draft.title || ""}`);
    li.append(tile, main, rm);
    return li;
  }

  // ---- Kütüphane görünümü ----
  const LOCAL = new Set(["mine", "saved", "drafts", "recent"]);
  function emptyKey(source, filtered) {
    if (filtered) return "noResults";
    return { mine: "emptyMine", saved: "emptySaved", recent: "emptyRecent", drafts: "emptyDrafts" }[source] || "noResults";
  }

  function createLibrary({ sourcesEl, typesEl, searchEl, listEl, noteEl, sources, source }) {
    const st = { source: source || sources[0], type: "all", query: "", loaded: [], cursor: null, loading: false, error: null, cached: false, open: null, gen: 0, autoPages: 0, values: {} };
    let observer = null;

    const visible = () => (LOCAL.has(st.source) ? st.loaded.filter((i) => PLib.matches(i, st.query, st.type)) : st.loaded);

    async function load(reset) {
      const gen = ++st.gen;
      if (reset) { st.loaded = []; st.cursor = null; st.error = null; st.cached = false; st.autoPages = 0; }
      st.loading = true; render();
      try {
        const local = LOCAL.has(st.source);
        const res = await PLib.list(st.source, local ? { cursor: st.cursor } : { query: st.query, type: st.type, cursor: st.cursor });
        if (gen !== st.gen) return;
        const seen = new Set(st.loaded.map((i) => i.id));
        st.loaded = st.loaded.concat(res.items.filter((i) => !seen.has(i.id)));
        st.cursor = res.nextCursor; st.cached = Boolean(res.cached); st.error = null;
      } catch (err) {
        if (gen !== st.gen) return;
        st.error = err;
      }
      st.loading = false;
      // Yerel kaynakta süzgeç/arama az sonuç verdiyse (API'de q yok) birkaç sayfa daha kendiliğinden yükle.
      if (!st.error && LOCAL.has(st.source) && st.cursor && (st.query || st.type !== "all") && visible().length < 8 && st.autoPages < 4) { st.autoPages += 1; return load(false); }
      render();
    }

    function renderChips() {
      if (sourcesEl) {
        sourcesEl.replaceChildren();
        for (const s of sources) sourcesEl.append(btn("chip" + (st.source === s ? " on" : ""), t({ recent: "srcRecent", mine: "srcMine", saved: "srcSaved", popular: "srcPopular", explore: "srcExplore", drafts: "tabDrafts" }[s]), () => { st.source = s; st.open = null; load(true); }));
      }
      if (typesEl) {
        typesEl.replaceChildren();
        for (const k of ["all", "image", "text", "audio", "video"]) typesEl.append(btn("chip" + (st.type === k ? " on" : ""), t(k === "all" ? "typeAll" : typeKey[k]), () => { st.type = k; st.open = null; if (LOCAL.has(st.source)) render(); else load(true); }));
      }
    }

    function metaOf(item) {
      const m = el("span", "m");
      m.append(el("span", "pill", t(typeKey[item.type])));
      for (const tool of (item.tools || []).slice(0, 2)) m.append(el("span", "", PI.TOOLS[String(tool).split(":")[0]] || tool));
      if (item.author) m.append(el("span", "", t("byAuthor", { a: item.author })));
      if (item.status === "draft") m.append(el("span", "pill warn", t("statusDraft")));
      else if (item.visibility === "private") m.append(el("span", "pill", t("statusPrivate")));
      return m;
    }

    function detailFor(item) {
      const box = el("div", "detail");
      box.append(el("span", "hint", t("textLoading")));
      PLib.text(item).then((data) => {
        box.replaceChildren();
        const code = el("div", "code"); writePrompt(code, data.text); box.append(code);
        const values = st.values[item.id] = st.values[item.id] || {};
        const names = PVars.variablesOf(data.text);
        for (const name of names) {
          const lab = el("label", "fl"); lab.append(el("span", "label", name));
          const inp = el("input", "in"); inp.value = values[name] || ""; inp.placeholder = (data.variables.find((v) => v.name === name) || {}).defaultValue || "";
          inp.addEventListener("input", () => { values[name] = inp.value; });
          lab.append(inp); box.append(lab);
        }
        const row = el("div", "actions-row");
        row.append(btn("btn sm pri", names.length ? t("fillCopy") : t("copy"), async () => {
          const ok = await copyText(PVars.resolve(data.text, data.variables, values));
          if (ok) await PLib.markUsed(item);
          toast(t(ok ? "copied" : "copyFailed"));
        }));
        if (self.PRunUI) row.append(PRunUI.splitButton(async (id) => { await PRunUI.runItem(item, { values, platformId: id, force: true }); }, { small: true }));
        row.append(anchor(itemHref(item), t("openOnSite")));
        box.append(row);
      }).catch((err) => { box.replaceChildren(el("span", "hint", errText(err) || t("textFailed"))); });
      return box;
    }

    function row(item) {
      const open = st.open === item.id;
      const li = el("li", "row" + (open ? " open" : ""));
      const tile = el("span", "tile"); tile.innerHTML = icon(item.type);
      const main = el("div", "main");
      const head = btn("rowhead", ""); head.setAttribute("aria-expanded", String(open));
      head.append(el("span", "t", item.title), metaOf(item));
      head.addEventListener("click", () => { st.open = open ? null : item.id; render(); });
      main.append(head);
      if (open) main.append(detailFor(item));
      const cp = btn("ico", "", async () => {
        try {
          const data = await PLib.text(item);
          const ok = await copyText(PVars.resolve(data.text, data.variables, st.values[item.id] || {}));
          if (ok) await PLib.markUsed(item);
          toast(t(ok ? "copied" : "copyFailed"));
        } catch (err) { toast(errText(err)); }
      });
      cp.innerHTML = icon("copy"); cp.title = t("copy"); cp.setAttribute("aria-label", `${t("copy")}: ${item.title}`);
      li.append(tile, main, cp);
      return li;
    }

    function render() {
      renderChips();
      listEl.replaceChildren();
      if (noteEl) { noteEl.replaceChildren(); noteEl.hidden = true; }
      const items = visible();
      if (st.error && !st.loaded.length) {
        const box = el("li", "empty"); box.append(el("p", "", t("loadFailed", { error: errText(st.error) })), btn("btn sm", t("retry"), () => load(true)));
        listEl.append(box); return;
      }
      if (noteEl && st.cached) { noteEl.hidden = false; noteEl.className = "banner"; noteEl.append(el("span", "", t("showingCached"))); }
      items.forEach((i) => listEl.append(row(i)));
      if (st.loading) listEl.append(el("li", "empty", t("loading")));
      else if (!items.length && !st.cursor) listEl.append(el("li", "empty", t(emptyKey(st.source, Boolean(st.query) || st.type !== "all"))));
      if (st.cursor && !st.loading) {
        const more = el("li", "more"); more.append(btn("btn sm full", t("loadMore"), () => load(false)));
        listEl.append(more);
        if (observer) observer.disconnect();
        if (self.IntersectionObserver) { observer = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !st.loading && st.cursor) load(false); }, { rootMargin: "200px" }); observer.observe(more); }
      }
    }

    let timer = null;
    if (searchEl) searchEl.addEventListener("input", (e) => {
      st.query = e.target.value; st.open = null;
      if (LOCAL.has(st.source)) render();
      else { clearTimeout(timer); timer = setTimeout(() => load(true), 300); }
    });
    return { load, render, setSource(s) { st.source = s; st.open = null; return load(true); }, get state() { return st; } };
  }

  return { t, icon, brand, el, btn, anchor, typeKey, writePrompt, copyText, toast, errText, applyLang, bg, renderStatus, queueRow, createLibrary, itemHref, editHref, openTab, siteUrl };
})();
