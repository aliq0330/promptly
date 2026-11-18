// Promptly uzantısı — geniş görünümün parçaları: görsel kart, süzgeç çubuğu, Görünümlerim, Ana Sayfa/Keşfet akışı, Kütüphane (slot + toplu seçim), ayrıntı bölmesi.
// Veri tek yerde (`PLib`); karar/mantık `PBrowse` ve `PPlatforms`'ta; burada yalnız DOM vardır. Kullanıcı içeriği `textContent` ile yazılır.
self.PBrowser = (() => {
  const { el, btn, icon } = PUI;
  const t = PUI.t;
  const env = { prefs: PBrowse.cleanPrefs({}), views: [], slots: [] };
  const toolName = (item) => { const id = String((item.tools && item.tools[0]) || "").split(":")[0]; return id ? PI.TOOLS[id] || id : ""; };
  const typeName = (item) => t(PUI.typeKey[item.type] || "typeText");

  async function loadEnv() {
    const d = await PStore.getAll();
    env.prefs = PBrowse.cleanPrefs(d.prefs); env.views = Array.isArray(d.views) ? d.views : []; env.slots = Array.isArray(d.slots) ? d.slots : [];
    return env;
  }
  const savePrefs = async (p) => { env.prefs = PBrowse.cleanPrefs(p); await PStore.set({ prefs: env.prefs }); };

  // ---- Kart / satır ----
  function artNode(item, big) {
    const a = PBrowse.artOf(item);
    const art = el("div", "art" + (big ? " big" : "")); art.style.background = a.bg;
    if (item.type === "text" && (item.preview || item.description)) art.append(el("div", "artText", item.preview || item.description));
    else { const ic = el("span", "arttype"); ic.innerHTML = icon(a.kind); art.append(ic); }
    return art;
  }
  async function quickCopy(item, ctx) {
    try {
      const r = await PRunUI.resolveText(item, {}, ctx && ctx.selection);
      const ok = await PUI.copyText(r.text);
      if (ok) await PLib.markUsed(item);
      PUI.toast(t(ok ? "copied" : "copyFailed"));
    } catch (err) { PUI.toast(PUI.errText(err)); }
  }
  async function quickRun(item, ctx) {
    const r = await PRunUI.runItem(item, { selection: ctx && ctx.selection });
    if (r && r.needVars && ctx && ctx.open) ctx.open(item);
  }
  function metaStats(item) {
    const m = el("div", "cmeta");
    if (item.author) m.append(el("span", "cauthor", t("byAuthor", { a: item.author })));
    if (item.stats) {
      const s1 = el("span", "cstat"); s1.innerHTML = icon("heart"); s1.append(String(item.stats.likes || 0));
      const s2 = el("span", "cstat"); s2.innerHTML = icon("copy"); s2.append(String(item.stats.copies || 0));
      m.append(s1, s2);
    }
    if (item.status === "draft") m.append(el("span", "pill warn", t("statusDraft")));
    else if (item.visibility === "private") m.append(el("span", "pill", t("statusPrivate")));
    return m;
  }

  function card(item, ctx) {
    const c = el("article", "card");
    const art = artNode(item);
    art.append(el("span", "tchip", [typeName(item), toolName(item)].filter(Boolean).join(" · ")));
    const hov = el("div", "hov");
    hov.append(btn("hbtn", t("copy"), () => quickCopy(item, ctx)), btn("hbtn pri", "", () => quickRun(item, ctx)));
    hov.lastChild.innerHTML = icon("play"); hov.lastChild.append(document.createTextNode(t("run")));
    art.append(hov);
    art.addEventListener("click", (e) => { if (!e.target.closest("button")) ctx.open(item); });
    const body = el("div", "cbody");
    const title = btn("ctitle", item.title, () => ctx.open(item));
    body.append(title);
    if (item.description) body.append(el("p", "cdesc", item.description));
    const names = item.variableNames || [];
    if (names.length) {
      const vs = el("div", "cvars");
      for (const n of names.slice(0, 3)) vs.append(el("span", "vchip", `{${n}}`));
      if (names.length > 3) vs.append(el("span", "vchip more", `+${names.length - 3}`));
      body.append(vs);
    }
    body.append(metaStats(item));
    c.append(art, body);
    return c;
  }

  function row(item, ctx) {
    const li = el("li", "lrow" + (ctx.selected && ctx.selected.has(item.id) ? " sel" : ""));
    if (ctx.onSelect) {
      const cb = el("input"); cb.type = "checkbox"; cb.checked = ctx.selected.has(item.id);
      cb.setAttribute("aria-label", `${t("selectRow")}: ${item.title}`);
      cb.addEventListener("change", () => ctx.onSelect(item, cb.checked));
      li.append(cb);
    }
    const thumb = artNode(item); thumb.classList.add("thumb"); thumb.querySelectorAll(".artText").forEach((n) => n.remove());
    if (!thumb.querySelector(".arttype")) { const ic = el("span", "arttype"); ic.innerHTML = icon(item.type || "text"); thumb.append(ic); }
    const main = el("div", "lmain");
    const head = btn("ctitle", item.title, () => ctx.open(item));
    const meta = el("div", "cmeta");
    meta.append(el("span", "pill", typeName(item)));
    const tn = toolName(item); if (tn) meta.append(el("span", "", tn));
    if (item.status === "draft") meta.append(el("span", "pill warn", t("statusDraft")));
    else if (item.visibility === "private") meta.append(el("span", "pill", t("statusPrivate")));
    if (item.author) meta.append(el("span", "", t("byAuthor", { a: item.author })));
    main.append(head, meta);
    const cp = btn("ico", "", () => quickCopy(item, ctx)); cp.innerHTML = icon("copy"); cp.title = t("copy"); cp.setAttribute("aria-label", `${t("copy")}: ${item.title}`);
    const run = btn("btn sm pri", "", () => quickRun(item, ctx)); run.innerHTML = icon("play"); run.append(document.createTextNode(t("run")));
    li.append(thumb, main, cp, run);
    return li;
  }

  // ---- Sayfalı yükleyici (sıra korumalı; süzgeç az sonuç verirse birkaç sayfa daha kendiliğinden) ----
  function makeLoader({ fetchPage, keep, onChange, minVisible = 6 }) {
    const st = { items: [], cursor: null, loading: false, error: null, cached: false, gen: 0, autos: 0 };
    async function load(reset) {
      const gen = ++st.gen;
      if (reset) { st.items = []; st.cursor = null; st.error = null; st.cached = false; st.autos = 0; }
      st.loading = true; onChange();
      try {
        const res = await fetchPage(reset ? null : st.cursor);
        if (gen !== st.gen) return;
        const seen = new Set(st.items.map((i) => i.id));
        st.items = st.items.concat(res.items.filter((i) => !seen.has(i.id)));
        st.cursor = res.nextCursor; st.cached = Boolean(res.cached); st.error = null;
      } catch (err) { if (gen !== st.gen) return; st.error = err; }
      st.loading = false;
      if (!st.error && st.cursor && keep(st.items).length < minVisible && st.autos < 4) { st.autos += 1; return load(false); }
      onChange();
    }
    return { st, load };
  }

  function listBody(host, loader, o) {
    const st = loader.st;
    host.replaceChildren();
    const items = o.keep(st.items);
    if (st.error && !st.items.length) {
      const box = el("div", "empty"); box.append(el("p", "", t("loadFailed", { error: PUI.errText(st.error) })), btn("btn sm", t("retry"), () => loader.load(true)));
      host.append(box); return;
    }
    if (st.cached) { const n = el("div", "banner"); n.append(el("span", "", t("showingCached"))); host.append(n); }
    const asList = o.asList;
    const wrap = el(asList ? "ul" : "div", asList ? "llist" : "grid d-" + env.prefs.density);
    for (const it of items) wrap.append(asList ? row(it, o.ctx) : card(it, o.ctx));
    host.append(wrap);
    if (st.loading) host.append(el("p", "empty", t("loading")));
    else if (!items.length && !st.cursor) host.append(el("p", "empty", t(o.emptyKey || "noResults")));
    if (st.cursor && !st.loading) {
      const more = btn("btn sm full", t("loadMore"), () => loader.load(false)); host.append(more);
      if (self.IntersectionObserver) { const ob = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting) && !st.loading && st.cursor) { ob.disconnect(); loader.load(false); } }, { rootMargin: "200px" }); ob.observe(more); }
    }
  }

  // ---- Süzgeç çubuğu ----
  function popover(anchor, build) {
    document.querySelectorAll(".pmenu.custom").forEach((n) => n.remove());
    const m = el("div", "pmenu custom"); build(m, close);
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = `${Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8))}px`;
    m.style.top = `${r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
    function close() { m.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); }
    function away(e) { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); }
    function key(e) { if (e.key === "Escape") { e.stopPropagation(); close(); anchor.focus(); } }
    setTimeout(() => { document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", key, true); }, 0);
    return close;
  }

  function customizeMenu(anchor, allowed, onDone) {
    popover(anchor, (m, close) => {
      m.append(el("div", "label", t("filtersShown")));
      const labels = { type: "filterType", tool: "filterTool", tag: "filterTag", vars: "filterVars" };
      for (const k of allowed) {
        const l = el("label", "chk"); const cb = el("input"); cb.type = "checkbox"; cb.checked = env.prefs.shown.includes(k);
        cb.addEventListener("change", async () => { const shown = cb.checked ? [...new Set([...env.prefs.shown, k])] : env.prefs.shown.filter((x) => x !== k); await savePrefs({ ...env.prefs, shown }); onDone(); });
        l.append(cb, document.createTextNode(t(labels[k]))); m.append(l);
      }
      m.append(el("div", "label", t("densityTitle")));
      const seg = el("div", "seg");
      for (const d of PBrowse.DENSITIES) {
        const b = btn(env.prefs.density === d ? "on" : "", t({ comfy: "densityComfy", tight: "densityTight", list: "densityList" }[d]), async () => { await savePrefs({ ...env.prefs, density: d }); close(); onDone(); });
        seg.append(b);
      }
      m.append(seg);
    });
  }

  function renderFilters(host, st, o) {
    // o: { allowed: [anahtarlar], sorts: [..]|null, onChange(reload) }
    host.replaceChildren();
    const shown = o.allowed.filter((k) => env.prefs.shown.includes(k));
    const bar = el("div", "fbar");
    if (shown.includes("type")) {
      const chips = el("div", "chips compact"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", t("filterType"));
      for (const k of PBrowse.TYPES) {
        const c = btn("chip" + (st.filters.type === k ? " on" : ""), t(k === "all" ? "typeAll" : PUI.typeKey[k]), () => {
          st.filters = { ...st.filters, type: k };
          if (st.filters.tool && k !== "all" && !(PI.TOOLS_BY_TYPE[k] || []).includes(st.filters.tool)) st.filters.tool = "";
          o.onChange(true);
        });
        c.setAttribute("aria-pressed", String(st.filters.type === k)); chips.append(c);
      }
      bar.append(chips);
    }
    if (shown.includes("tool")) {
      const sel = el("select", "in sel"); sel.setAttribute("aria-label", t("filterTool"));
      const any = el("option", "", t("filterToolAny")); any.value = ""; sel.append(any);
      const types = st.filters.type === "all" ? Object.keys(PI.TOOLS_BY_TYPE) : [st.filters.type];
      for (const ty of types) {
        const g = el("optgroup"); g.label = t(PUI.typeKey[ty]);
        for (const id of PI.TOOLS_BY_TYPE[ty] || []) { const op = el("option", "", PI.TOOLS[id] || id); op.value = id; g.append(op); }
        sel.append(g);
      }
      sel.value = st.filters.tool;
      sel.addEventListener("change", () => { st.filters = { ...st.filters, tool: sel.value }; o.onChange(true); });
      bar.append(sel);
    }
    if (shown.includes("tag")) {
      const inp = el("input", "in tag"); inp.type = "search"; inp.placeholder = t("filterTagPh"); inp.setAttribute("aria-label", t("filterTag")); inp.value = st.filters.tag; inp.autocomplete = "off";
      let timer = null;
      inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { st.filters = { ...st.filters, tag: PBrowse.tagSlug(inp.value) }; o.onChange(true, { keepBar: true }); }, 350); });
      bar.append(inp);
    }
    if (shown.includes("vars")) {
      const l = el("label", "chk"); const cb = el("input"); cb.type = "checkbox"; cb.checked = st.filters.vars;
      cb.addEventListener("change", () => { st.filters = { ...st.filters, vars: cb.checked }; o.onChange(false); });
      l.append(cb, document.createTextNode(t("filterVars"))); bar.append(l);
    }
    bar.append(el("span", "grow"));
    if (o.sorts) {
      const seg = el("div", "seg tight"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", t("sortLabel"));
      for (const s of o.sorts) {
        const b = btn(st.sort === s ? "on" : "", t({ relevant: "sortRelevant", new: "sortNew", popular: "sortPopular" }[s]), () => { st.sort = s; o.onChange(true); });
        b.setAttribute("aria-pressed", String(st.sort === s)); seg.append(b);
      }
      bar.append(seg);
    }
    const gear = btn("ico round" + (env.prefs.shown.length < PBrowse.FILTER_KEYS.length || env.prefs.density !== "comfy" ? " on" : ""), "", () => customizeMenu(gear, o.allowed, () => o.onChange(false, { rerender: true })));
    gear.innerHTML = icon("sliders"); gear.title = t("filterCustomize"); gear.setAttribute("aria-label", t("filterCustomize")); gear.setAttribute("aria-haspopup", "true");
    bar.append(gear);
    host.append(bar);

    const acts = el("div", "fact");
    const active = PBrowse.activeCount(st.filters) > 0;
    if (active) acts.append(btn("linkbtn", t("filterReset"), () => { st.filters = { ...PBrowse.DEFAULT_FILTERS }; o.onChange(true); }));
    if (active || st.sort !== o.defaultSort) acts.append(btn("linkbtn", t("viewSave"), (e) => saveViewInline(acts, st, o)));
    if (acts.childNodes.length) host.append(acts);
  }

  function saveViewInline(acts, st, o) {
    acts.replaceChildren();
    const inp = el("input", "in tag"); inp.placeholder = t("viewNamePh"); inp.maxLength = 30; inp.setAttribute("aria-label", t("viewNamePh"));
    const go = async () => {
      const res = PBrowse.addView(env.views, { name: inp.value, tab: o.mode, filters: st.filters, sort: st.sort });
      if (res.error === "duplicate") { PUI.toast(t("viewExists")); return; }
      if (res.error === "full") { PUI.toast(t("viewFull", { n: PBrowse.MAX_VIEWS })); return; }
      if (res.error) return;
      env.views = res.views; await PStore.set({ views: env.views }); PUI.toast(t("viewSaved")); o.onChange(false, { rerender: true });
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } if (e.key === "Escape") o.onChange(false, { rerender: true }); });
    acts.append(inp, btn("btn sm pri", t("viewSave"), go), btn("linkbtn", t("cancel"), () => o.onChange(false, { rerender: true })));
    inp.focus();
  }

  function renderViews(host, st, o) {
    host.replaceChildren();
    const mine = env.views.filter((v) => v.tab === o.mode);
    if (!mine.length) { host.hidden = true; return; }
    host.hidden = false;
    host.append(el("span", "label", t("viewsTitle")));
    for (const v of mine) {
      const on = PBrowse.sameFilters(v.filters, st.filters) && (v.sort || o.defaultSort) === st.sort;
      const wrap = el("span", "vpill" + (on ? " on" : ""));
      const b = btn("vapply", v.name, () => { st.filters = PBrowse.cleanFilters(v.filters); st.sort = v.sort || o.defaultSort; o.onChange(true, { rerender: true }); });
      b.setAttribute("aria-pressed", String(on));
      const x = btn("vdel", "", async () => { env.views = PBrowse.removeView(env.views, v.id); await PStore.set({ views: env.views }); o.onChange(false, { rerender: true }); });
      x.innerHTML = icon("x"); x.title = t("viewRemove"); x.setAttribute("aria-label", `${t("viewRemove")}: ${v.name}`);
      wrap.append(b, x); host.append(wrap);
    }
  }

  // ---- Ana Sayfa / Keşfet akışı ----
  function createFeed({ mode, host, open, getQuery, getSelection }) {
    const home = mode === "home";
    const defaultSort = home ? "popular" : "relevant";
    const st = { filters: { ...PBrowse.DEFAULT_FILTERS }, sort: defaultSort };
    const allowed = home ? ["type"] : PBrowse.FILTER_KEYS;
    const sorts = home ? ["popular", "new"] : ["relevant", "new", "popular"];
    host.replaceChildren();
    const noteEl = el("p", "hint homenote", home ? t("homeFeedSoon") : ""); noteEl.hidden = !home;
    const recentEl = el("div", "recentstrip"); recentEl.hidden = !home;
    const viewsEl = el("div", "vbar"); const filtersEl = el("div", "filters"); const listEl = el("div", "feedlist");
    host.append(noteEl, recentEl, viewsEl, filtersEl, listEl);
    const ctx = { open: (it) => open(it, { selection: getSelection && getSelection() }), get selection() { return getSelection && getSelection(); } };
    const loader = makeLoader({
      fetchPage: (cursor) => {
        const a = PBrowse.searchArgs(st.filters, { query: home ? "" : getQuery(), cursor, sort: home ? st.sort : (getQuery() ? st.sort : (st.sort === "relevant" ? "new" : st.sort)) });
        return PLib.list("explore", { query: a.q || "", type: st.filters.type, cursor, tools: a.tools, tags: a.tags, sort: a.sort });
      },
      keep: (items) => PBrowse.clientFilter(items, st.filters),
      onChange: () => paintList(),
    });
    function paintList() { listBody(listEl, loader, { keep: (items) => PBrowse.clientFilter(items, st.filters), asList: env.prefs.density === "list", ctx, emptyKey: "noResults" }); }
    function paintBars() { renderViews(viewsEl, st, o); renderFilters(filtersEl, st, o); }
    const o = {
      mode, allowed, sorts, defaultSort,
      onChange(reload, opts = {}) {
        if (!opts.keepBar) paintBars();
        if (reload) loader.load(true); else paintList();
        if (home) paintRecent();
      },
    };
    async function paintRecent() {
      const recent = (await PStore.get("recent")).slice(0, 6);
      recentEl.replaceChildren(); recentEl.hidden = !recent.length;
      if (!recent.length) return;
      recentEl.append(el("span", "label", t("homeRecent")));
      for (const r of recent) recentEl.append(btn("rchip", r.title, () => open(r, { selection: getSelection && getSelection() })));
    }
    return {
      start() { paintBars(); paintRecent(); return loader.load(true); },
      reload() { return loader.load(true); },
      repaint() { paintBars(); paintList(); paintRecent(); },
      get state() { return st; },
    };
  }

  // ---- Kütüphane: alt sekmeler, slotlar, toplu seçim, satırlar ----
  function createLibraryView({ host, open, getQuery, getQueue, onSlotsChange }) {
    const st = { source: "mine", type: "all", selected: new Map() };
    host.replaceChildren();
    const subEl = el("div", "chips compact"), slotsEl = el("div", "slotsbar"), toolEl = el("div", "libtools"), listEl = el("div", "liblist");
    host.append(subEl, slotsEl, toolEl, listEl);
    const SOURCES = ["mine", "saved", "drafts", "recent", "pending"];
    const label = { mine: "srcMine", saved: "srcSaved", drafts: "tabDrafts", recent: "srcRecentFull", pending: "tabPending" };
    const ctx = {
      open: (it) => open(it, {}),
      selected: { has: (id) => st.selected.has(id) },
      onSelect(item, on) { if (on) st.selected.set(item.id, item); else st.selected.delete(item.id); paintTools(); paintList(); },
    };
    const keep = (items) => items.filter((i) => PLib.matches(i, getQuery(), st.type));
    const loader = makeLoader({
      fetchPage: (cursor) => PLib.list(st.source, { cursor }),
      keep, onChange: () => paintList(), minVisible: 8,
    });

    function paintSub() {
      subEl.replaceChildren();
      for (const s of SOURCES) {
        const c = btn("chip" + (st.source === s ? " on" : ""), t(label[s]), () => { st.source = s; st.selected.clear(); paintSub(); paintTools(); if (s === "pending") paintList(); else loader.load(true); });
        c.setAttribute("aria-pressed", String(st.source === s));
        if (s === "pending") { const n = getQueue().length; if (n) { const em = el("em", "", String(n)); c.append(em); } }
        subEl.append(c);
      }
    }
    function paintSlots() {
      slotsEl.replaceChildren();
      slotsEl.append(el("span", "label", t("slotsTitle")));
      for (let i = 0; i < PBrowse.MAX_SLOTS; i++) {
        const s = env.slots[i];
        if (s) {
          const wrap = el("span", "slot on");
          wrap.append(el("kbd", "", String(i + 1)));
          wrap.append(btn("slotrun", s.title, () => runSlot(i)));
          const x = btn("vdel", "", () => unpin(s.id)); x.innerHTML = icon("x"); x.title = t("slotUnpin"); x.setAttribute("aria-label", `${t("slotUnpin")}: ${s.title}`);
          wrap.append(x); slotsEl.append(wrap);
        } else { const e = el("span", "slot empty"); e.append(el("kbd", "", String(i + 1)), document.createTextNode(t("slotEmpty"))); slotsEl.append(e); }
      }
    }
    function paintTools() {
      toolEl.replaceChildren();
      if (st.selected.size) {
        const bar = el("div", "bulkbar");
        bar.append(el("span", "bn", t("bulkSelected", { n: st.selected.size })));
        const ex = btn("btn sm", "", exportSelected); ex.innerHTML = icon("download"); ex.append(document.createTextNode(t("bulkExport")));
        bar.append(ex, btn("linkbtn", t("bulkClear"), () => { st.selected.clear(); paintTools(); paintList(); }));
        toolEl.append(bar); return;
      }
      if (st.source === "pending") return;
      const chips = el("div", "chips compact");
      for (const k of PBrowse.TYPES) { const c = btn("chip" + (st.type === k ? " on" : ""), t(k === "all" ? "typeAll" : PUI.typeKey[k]), () => { st.type = k; paintTools(); paintList(); }); c.setAttribute("aria-pressed", String(st.type === k)); chips.append(c); }
      toolEl.append(chips);
    }
    function paintList() {
      if (st.source === "pending") {
        listEl.replaceChildren();
        const q = getQueue(); const ul = el("ul", "list");
        q.forEach((it) => ul.append(PUI.queueRow(it)));
        listEl.append(ul);
        if (!q.length) listEl.append(el("p", "empty", t("emptyPending")));
        return;
      }
      const emptyKey = { mine: "emptyMine", saved: "emptySaved", drafts: "emptyDrafts", recent: "emptyRecent" }[st.source];
      listBody(listEl, loader, { keep, asList: true, ctx, emptyKey: getQuery() || st.type !== "all" ? "noResults" : emptyKey });
    }

    async function runSlot(i) {
      const s = env.slots[i]; if (!s) return;
      const r = await PRunUI.runItem(s, {});
      if (r && r.needVars) open(s, {});
    }
    async function unpin(id) { env.slots = PBrowse.unpinSlot(env.slots, id); await PStore.set({ slots: env.slots }); paintSlots(); if (onSlotsChange) onSlotsChange(); }
    async function exportSelected() {
      const items = [...st.selected.values()];
      try {
        const entries = [];
        for (const it of items) { const d = await PLib.text(it); entries.push({ title: it.title, text: d.text, type: it.type, tools: it.tools || [] }); }
        const file = PBrowse.exportFile(entries);
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `promptly-prompts-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        PUI.toast(t("bulkExported", { n: entries.length }));
      } catch (err) { PUI.toast(t("bulkExportFailed", { error: PUI.errText(err) })); }
    }
    return {
      start() { paintSub(); paintSlots(); paintTools(); return st.source === "pending" ? paintList() : loader.load(true); },
      repaint() { paintSub(); paintSlots(); paintTools(); paintList(); },
      refilter() { paintList(); },
      runSlot,
      reloadCurrent() { if (st.source !== "pending") return loader.load(true); paintList(); },
    };
  }

  // ---- Ayrıntı bölmesi ----
  let paneOpener = null;
  function closeDetail() { document.querySelectorAll(".detailpane").forEach((n) => n.remove()); if (paneOpener && paneOpener.isConnected) paneOpener.focus(); paneOpener = null; }
  async function openDetail(item, opts = {}) {
    closeDetail(); paneOpener = document.activeElement;
    const pane = el("aside", "detailpane"); pane.setAttribute("role", "dialog"); pane.setAttribute("aria-label", item.title);
    const head = el("div", "dhead");
    const x = btn("ico round", "", closeDetail); x.innerHTML = icon("x"); x.title = t("close"); x.setAttribute("aria-label", t("close"));
    head.append(el("h2", "dtitle", item.title), x);
    const body = el("div", "dbody");
    const art = artNode(item, true); art.append(el("span", "tchip", [typeName(item), toolName(item)].filter(Boolean).join(" · ")));
    body.append(art, metaStats(item));
    if (item.description) body.append(el("p", "cdesc full", item.description));
    const slot = el("div", "stack"); slot.append(el("p", "hint", t("textLoading"))); body.append(slot);
    pane.append(head, body);
    pane.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeDetail(); } });
    document.body.append(pane); x.focus();
    let data;
    try { data = await PLib.text(item); } catch (err) { slot.replaceChildren(el("p", "hint", PUI.errText(err) || t("textFailed"))); return; }
    if (!pane.isConnected) return;
    slot.replaceChildren();
    const names = PVars.variablesOf(data.text);
    const values = Object.assign({}, opts.selection ? PBrowse.selectionValues(names, opts.selection) : {});
    const code = el("div", "code"); PUI.writePrompt(code, data.text);
    slot.append(el("div", "label", t("palPreview")), code);
    const preview = el("div", "code resolved");
    const paint = () => { preview.textContent = PVars.resolve(data.text, data.variables, values); };
    if (names.length) {
      slot.append(el("div", "label", t("detailVars")));
      for (const n of names) {
        const lab = el("label", "fl"); lab.append(el("span", "label", n));
        const inp = el("input", "in"); inp.value = values[n] || ""; inp.placeholder = (data.variables.find((v) => v.name === n) || {}).defaultValue || "";
        inp.addEventListener("input", () => { values[n] = inp.value; paint(); }); lab.append(inp); slot.append(lab);
      }
      slot.append(el("div", "label", t("detailPreview")), preview);
    }
    paint();
    const acts = el("div", "dacts");
    acts.append(btn("btn", t("copy"), async () => { const ok = await PUI.copyText(PVars.resolve(data.text, data.variables, values)); if (ok) await PLib.markUsed(item); PUI.toast(t(ok ? "copied" : "copyFailed")); }));
    const pinned = PBrowse.isPinned(env.slots, item.id);
    const pin = btn("btn", "", async () => {
      if (PBrowse.isPinned(env.slots, item.id)) env.slots = PBrowse.unpinSlot(env.slots, item.id);
      else { const r = PBrowse.pinSlot(env.slots, item); if (r.error) { PUI.toast(t("slotFull")); return; } env.slots = r.slots; }
      await PStore.set({ slots: env.slots }); const on = PBrowse.isPinned(env.slots, item.id);
      pin.innerHTML = icon("pin"); pin.append(document.createTextNode(t(on ? "slotUnpin" : "slotPin")));
      if (opts.onSlotsChange) opts.onSlotsChange();
    });
    pin.innerHTML = icon("pin"); pin.append(document.createTextNode(t(pinned ? "slotUnpin" : "slotPin")));
    acts.append(pin);
    const a = PUI.anchor(PUI.itemHref(item), t("openOnSite"), "btn"); acts.append(a);
    body.append(acts);
    const foot = el("div", "dfoot");
    foot.append(PRunUI.splitButton(async (id) => { await PRunUI.runItem(item, { values, selection: opts.selection, platformId: id, force: true }); }));
    pane.append(foot);
  }

  return { env, loadEnv, createFeed, createLibraryView, openDetail, closeDetail, card, row, quickRun, quickCopy };
})();
