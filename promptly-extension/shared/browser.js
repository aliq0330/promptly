// Promptly uzantısı — geniş görünümün parçaları: görsel kart, süzgeç çubuğu, Görünümlerim, Ana Sayfa/Keşfet akışı, Kütüphane (slot + toplu seçim), ayrıntı bölmesi.
// Veri tek yerde (`PLib`); karar/mantık `PBrowse` ve `PPlatforms`'ta; burada yalnız DOM vardır. Kullanıcı içeriği `textContent` ile yazılır.
self.PBrowser = (() => {
  const { el, btn, icon } = PUI;
  const t = PUI.t;
  const env = { prefs: PBrowse.cleanPrefs({}), views: [], slots: [], signed: false, interact: false, me: "" };
  const toolName = (item) => { const id = String((item.tools && item.tools[0]) || "").split(":")[0]; return id ? PI.TOOLS[id] || id : ""; };
  const typeName = (item) => t(PUI.typeKey[item.type] || "typeText");

  async function loadEnv() {
    const d = await PStore.getAll();
    env.prefs = PBrowse.cleanPrefs(d.prefs); env.views = Array.isArray(d.views) ? d.views : []; env.slots = Array.isArray(d.slots) ? d.slots : [];
    // Etkileşim (beğeni/kaydet/takip/oy) yalnız `interact` kapsamı verildiyse çalışır; kapsam yoksa ayrıntıda "izni aç" bağlantısı çıkar.
    env.signed = Boolean(d.auth && d.auth.refreshToken); env.interact = PAuth.canInteract(d.auth); env.me = (d.auth && d.auth.user && d.auth.user.username) || "";
    return env;
  }
  const savePrefs = async (p) => { env.prefs = PBrowse.cleanPrefs(p); await PStore.set({ prefs: env.prefs }); };

  // ---- Kart / satır ----
  function artNode(item, big) {
    const a = PBrowse.artOf(item);
    const art = el("div", "art" + (big ? " big" : "")); art.style.background = a.bg;
    if (item.type === "text" && (item.preview || item.description)) art.append(el("div", "artText", item.preview || item.description));
    else { const ic = el("span", "arttype"); ic.innerHTML = icon(a.kind); art.append(ic); }
    // Gerçek küçük resim (açık API'nin ~10 dk'lık imzalı adresi): yüklenirse yer tutucunun üstüne biner, yüklenemezse (süresi dolmuş/ağ) yer tutucu kalır.
    if (item.thumbnailUrl && /^https:\/\//.test(item.thumbnailUrl)) {
      const img = el("img", "thumbimg"); img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
      img.addEventListener("load", () => art.classList.add("hasimg"));
      img.addEventListener("error", () => img.remove());
      img.src = item.thumbnailUrl;
      art.prepend(img);
    }
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
    const w = item.works, total = w ? w.yes + w.no : 0;
    if (total >= 5) { const b = el("span", "pill ok", `✓ %${Math.round((w.yes / total) * 100)}`); b.title = t("worksTitle", { yes: w.yes, total }); m.append(b); } // az oyla yüzde gösterilmez (site kuralı)
    if (item.status === "draft") m.append(el("span", "pill warn", t("statusDraft")));
    else if (item.visibility === "private") m.append(el("span", "pill", t("statusPrivate")));
    return m;
  }

  // ---- Etkileşim düğmeleri (kart ve satır): beğeni ♥ / kaydet 🔖. Durum `PEngage`'dedir; yalnız okunabilir, başkasının, herkese açık promptta çizilir. ----
  const reasonText = (r) => {
    if (!r) return "";
    const k = { creator: "reasonCreator", tag: "reasonTag", liked_tag: "reasonLikedTag", tool: "reasonTool", interest: "reasonInterest", popular: "reasonPopular" }[r.kind];
    return k ? t(k, { ref: r.ref || "" }) : "";
  };
  function paintEngageBtns(id) {
    const s = PEngage.get(id);
    document.querySelectorAll("[data-eng]").forEach((n) => {
      if (n.dataset.eng !== id) return;
      const on = n.dataset.kind === "like" ? Boolean(s && s.reaction) : Boolean(s && s.saved);
      n.classList.toggle("on", on); n.setAttribute("aria-pressed", String(on));
    });
  }
  PEngage.on(paintEngageBtns);
  async function guarded(fn) { try { await fn(); } catch (err) { PUI.toast(PUI.errText(err)); } }
  function engageButtons(item, ctx) {
    const s = PEngage.get(item.id);
    if (!env.interact || !s || s.authorUsername === env.me) return null;
    const mk = (kind, ic, title, on, action) => {
      const b = btn("ico eng" + (on ? " on" : ""), "", (e) => { e.stopPropagation(); guarded(async () => { await action(PEngage.get(item.id)); if (ctx && ctx.onEngage) ctx.onEngage(item); }); });
      b.innerHTML = icon(ic); b.dataset.eng = item.id; b.dataset.kind = kind; b.title = title; b.setAttribute("aria-label", `${title}: ${item.title}`); b.setAttribute("aria-pressed", String(on));
      return b;
    };
    const box = el("span", "engbtns");
    box.append(
      mk("like", "heart", t("engLike"), Boolean(s.reaction), (cur) => PEngage.react(item.id, cur && cur.reaction ? null : "love")),
      mk("save", "bookmark", t("engSave"), Boolean(s.saved), (cur) => PEngage.save(item.id, !(cur && cur.saved))),
    );
    return box;
  }

  function card(item, ctx) {
    const c = el("article", "card");
    const art = artNode(item);
    art.append(el("span", "tchip", [typeName(item), toolName(item)].filter(Boolean).join(" · ")));
    const hov = el("div", "hov");
    hov.append(btn("hbtn", t("copy"), () => quickCopy(item, ctx)), btn("hbtn pri", "", () => quickRun(item, ctx)));
    hov.lastChild.innerHTML = icon("play"); hov.lastChild.append(document.createTextNode(t("run")));
    art.append(hov);
    const eng = engageButtons(item, ctx); if (eng) art.append(eng);
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
    const why = reasonText(item.reason); if (why) body.append(el("p", "reason", why));
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
    li.append(thumb, main);
    const eng = engageButtons(item, ctx); if (eng) li.append(eng);
    li.append(cp, run);
    return li;
  }

  // ---- Sayfalı yükleyici (sıra korumalı; süzgeç az sonuç verirse birkaç sayfa daha kendiliğinden) ----
  function makeLoader({ fetchPage, keep, onChange, minVisible = 6, engage = true }) {
    const st = { items: [], cursor: null, loading: false, error: null, cached: false, gen: 0, autos: 0 };
    async function load(reset) {
      const gen = ++st.gen;
      if (reset) { st.items = []; st.cursor = null; st.error = null; st.cached = false; st.autos = 0; }
      st.loading = true; onChange();
      try {
        const res = await fetchPage(reset ? null : st.cursor);
        // Benim durumum (beğeni/kaydet…) sayfa çizilmeden önce yüklenir; kapsam yoksa ya da kişisel kaynakta atlanır.
        if (engage && env.interact) await PEngage.load(res.items.filter((i) => !i.own && i.source !== "mine" && i.source !== "drafts").map((i) => i.id));
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
    // Ana Sayfa: Sana özel (`/me/feed?tab=for_you`) · Takip ettiklerim (`following`) · Popüler (herkese açık, eski akış). Keşfet'te sekme yok.
    const st = { filters: { ...PBrowse.DEFAULT_FILTERS }, sort: defaultSort, tab: "for_you" };
    const allowed = home ? ["type"] : PBrowse.FILTER_KEYS;
    host.replaceChildren();
    const tabsEl = el("div", "seg homeseg"); tabsEl.hidden = !home; tabsEl.setAttribute("role", "group"); tabsEl.setAttribute("aria-label", t("homeTabsLabel"));
    const recentEl = el("div", "recentstrip"); recentEl.hidden = !home;
    const viewsEl = el("div", "vbar"); const filtersEl = el("div", "filters"); const listEl = el("div", "feedlist");
    host.append(tabsEl, recentEl, viewsEl, filtersEl, listEl);
    const personal = () => home && st.tab !== "popular";
    const ctx = { open: (it) => open(it, { selection: getSelection && getSelection() }), get selection() { return getSelection && getSelection(); } };
    const loader = makeLoader({
      fetchPage: (cursor) => {
        if (personal()) return PLib.list(st.tab === "for_you" ? "feed_for_you" : "feed_following", { cursor, type: st.filters.type });
        const a = PBrowse.searchArgs(st.filters, { query: home ? "" : getQuery(), cursor, sort: home ? st.sort : (getQuery() ? st.sort : (st.sort === "relevant" ? "new" : st.sort)) });
        return PLib.list("explore", { query: a.q || "", type: st.filters.type, cursor, tools: a.tools, tags: a.tags, sort: a.sort });
      },
      keep: (items) => PBrowse.clientFilter(items, st.filters),
      onChange: () => paintList(),
    });
    function paintList() { listBody(listEl, loader, { keep: (items) => PBrowse.clientFilter(items, st.filters), asList: env.prefs.density === "list", ctx, emptyKey: personal() ? (st.tab === "for_you" ? "emptyForYou" : "emptyFollowing") : "noResults" }); }
    function paintTabs() {
      tabsEl.replaceChildren();
      for (const k of ["for_you", "following", "popular"]) {
        const b = btn(st.tab === k ? "on" : "", t({ for_you: "homeForYou", following: "homeFollowing", popular: "homePopular" }[k]), () => { if (st.tab === k) return; st.tab = k; paintTabs(); o.onChange(true); });
        b.setAttribute("aria-pressed", String(st.tab === k)); tabsEl.append(b);
      }
    }
    function paintBars() { renderViews(viewsEl, st, o); renderFilters(filtersEl, st, o); viewsEl.hidden = viewsEl.hidden || personal(); }
    const o = {
      mode, allowed, defaultSort,
      // Sıralama yalnız Keşfet'te ve Ana Sayfa'nın Popüler sekmesinde vardır; kişisel akışların sırası sunucudadır.
      get sorts() { return home ? (st.tab === "popular" ? ["popular", "new"] : null) : ["relevant", "new", "popular"]; },
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
      start() { paintTabs(); paintBars(); paintRecent(); return loader.load(true); },
      reload() { return loader.load(true); },
      repaint() { paintTabs(); paintBars(); paintList(); paintRecent(); },
      get state() { return st; },
    };
  }

  // ---- Kütüphane: alt sekmeler, slotlar, toplu seçim, satırlar ----
  function createLibraryView({ host, open, getQuery, getQueue, onSlotsChange }) {
    const st = { source: "mine", type: "all", selected: new Map(), collection: null, cols: null };
    host.replaceChildren();
    const subEl = el("div", "chips compact"), slotsEl = el("div", "slotsbar"), toolEl = el("div", "libtools"), listEl = el("div", "liblist");
    host.append(subEl, slotsEl, toolEl, listEl);
    const SOURCES = ["mine", "saved", "collections", "drafts", "recent", "pending"];
    const label = { mine: "srcMine", saved: "srcSaved", collections: "srcCollections", drafts: "tabDrafts", recent: "srcRecentFull", pending: "tabPending" };
    const ctx = {
      open: (it) => open(it, {}),
      // Kayıtlar/koleksiyonlar görünümünde bir etkileşim listeyi değiştirebilir (kaydı kaldırmak vb.): açıkken yeniden yükle.
      onEngage: () => { if (st.source === "saved") afterEngage(); },
      selected: { has: (id) => st.selected.has(id) },
      onSelect(item, on) { if (on) st.selected.set(item.id, item); else st.selected.delete(item.id); paintTools(); paintList(); },
    };
    const keep = (items) => items.filter((i) => PLib.matches(i, getQuery(), st.type));
    const loader = makeLoader({
      fetchPage: (cursor) => (st.source === "collections" ? PLib.list("collection", { cursor, collectionId: st.collection.id }) : PLib.list(st.source, { cursor })),
      keep, onChange: () => paintList(), minVisible: 8,
    });
    async function loadCollections() {
      st.cols = { loading: true }; paintList();
      try { st.cols = { items: await PEngage.collections(true) }; } catch (err) { st.cols = { error: err }; }
      paintList();
    }
    function openCollection(c) { st.collection = c; st.selected.clear(); paintTools(); loader.load(true); }
    function afterEngage() {
      if (st.source === "collections" && st.collection) loader.load(true);
      else if (st.source === "saved") loader.load(true);
      else if (st.source === "collections") loadCollections();
    }

    function paintSub() {
      subEl.replaceChildren();
      for (const s of SOURCES) {
        const c = btn("chip" + (st.source === s ? " on" : ""), t(label[s]), () => {
          st.source = s; st.selected.clear(); st.collection = null; paintSub(); paintTools();
          if (s === "pending") paintList(); else if (s === "collections") loadCollections(); else loader.load(true);
        });
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
      if (st.source === "collections") {
        if (st.collection) { const back = btn("linkbtn backbtn", "", () => { st.collection = null; st.selected.clear(); paintTools(); if (st.cols && st.cols.items) paintList(); else loadCollections(); }); back.innerHTML = icon("back"); back.append(document.createTextNode(t("srcCollections")), el("strong", "", ` · ${st.collection.name}`)); toolEl.append(back); }
        return;
      }
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
      if (st.source === "collections" && !st.collection) { paintCollections(); return; }
      const emptyKey = { mine: "emptyMine", saved: "emptySaved", collections: "emptyCollection", drafts: "emptyDrafts", recent: "emptyRecent" }[st.source];
      listBody(listEl, loader, { keep, asList: true, ctx, emptyKey: getQuery() || st.type !== "all" ? "noResults" : emptyKey });
    }

    function paintCollections() {
      listEl.replaceChildren();
      const c = st.cols || {};
      if (c.loading || !st.cols) { listEl.append(el("p", "empty", t("loading"))); return; }
      if (c.error) { const box = el("div", "empty"); box.append(el("p", "", t("loadFailed", { error: PUI.errText(c.error) })), btn("btn sm", t("retry"), loadCollections)); listEl.append(box); return; }
      const q = String(getQuery() || "").trim().toLowerCase();
      const items = (c.items || []).filter((x) => !q || x.name.toLowerCase().includes(q));
      if (!items.length) { const box = el("div", "empty"); box.append(el("p", "", t(q ? "noResults" : "emptyCollections")), PUI.anchor(`${PUI.siteUrl()}/saved/`, t("openOnSite"), "btn sm")); listEl.append(box); return; }
      const ul = el("ul", "llist");
      for (const x of items) {
        const li = el("li", "lrow colrow");
        const ic = el("span", "colicon"); ic.innerHTML = icon("folder");
        const main = el("div", "lmain");
        main.append(btn("ctitle", x.name, () => openCollection(x)));
        const meta = el("div", "cmeta"); meta.append(el("span", "", t("collectionCount", { n: x.promptCount })));
        if (x.shared) meta.append(el("span", "pill", t("collectionShared")));
        if (!x.mine && x.owner) meta.append(el("span", "", t("byAuthor", { a: x.owner })));
        main.append(meta); li.append(ic, main); ul.append(li);
      }
      listEl.append(ul);
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
      afterEngage,
      reloadCurrent() { if (st.source === "collections" && !st.collection) return loadCollections(); if (st.source !== "pending") return loader.load(true); paintList(); },
    };
  }

  // ---- Ayrıntı bölmesi ----
  let paneOpener = null;
  function closeDetail() { document.querySelectorAll(".detailpane").forEach((n) => n.remove()); if (paneOpener && paneOpener.isConnected) paneOpener.focus(); paneOpener = null; }
  const fmtDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(PI.getLang() === "tr" ? "tr-TR" : "en-US"); };
  const person = (a) => (a && (a.displayName ? `${a.displayName} (@${a.username})` : `@${a.username}`)) || "";
  const isPublicItem = (item) => item.source !== "drafts" && item.status !== "draft" && item.visibility !== "private";

  // Alt kaynak satırları: sonuç / sürüm / yorum. Hepsi kullanıcı içeriğidir (veri): yalnız `textContent`, görsel yalnız https.
  function resultRow(r) {
    const li = el("li", "subrow");
    li.append(el("div", "subhead", [person(r.author), r.tool, fmtDate(r.createdAt)].filter(Boolean).join(" · ")));
    if (r.imageUrl && /^https:\/\//.test(r.imageUrl)) { const img = el("img", "rimg"); img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer"; img.addEventListener("error", () => img.remove()); img.src = r.imageUrl; li.append(img); }
    if (r.text) li.append(el("p", "subtext", r.text));
    if (r.modified) li.append(el("p", "hint", `${t("subModified")}${r.modificationSummary ? `: ${r.modificationSummary}` : ""}`));
    const foot = el("div", "subfoot"); foot.append(el("span", "cstat", `♥ ${r.likes || 0}`), PUI.anchor(r.url, t("openOnSite"))); li.append(foot);
    return li;
  }
  function versionRow(v) {
    const li = el("li", "subrow");
    li.append(el("div", "subhead", [`v${v.versionNumber}`, v.title, person(v.author), fmtDate(v.createdAt)].filter(Boolean).join(" · ")));
    const code = el("div", "code clamp"); PUI.writePrompt(code, v.promptText || ""); li.append(code);
    const foot = el("div", "subfoot");
    foot.append(btn("linkbtn", t("copy"), async () => PUI.toast(t((await PUI.copyText(v.promptText || "")) ? "copied" : "copyFailed"))));
    li.append(foot);
    return li;
  }
  function commentNode(c, reply) {
    const li = el("li", "subrow" + (reply ? " reply" : ""));
    const head = el("div", "subhead", [person(c.author), fmtDate(c.createdAt), c.edited ? t("subEdited") : ""].filter(Boolean).join(" · "));
    if (c.pinned) head.append(el("span", "pill", t("subPinned")));
    li.append(head, el("p", "subtext", c.text), el("div", "subfoot", `♥ ${c.likes || 0}`));
    if (c.replies && c.replies.length) { const ul = el("ul", "sublist"); for (const r of c.replies) ul.append(commentNode(r, true)); li.append(ul); }
    return li;
  }
  const SUBS = { results: { api: "results", row: resultRow, empty: "subNoResults" }, versions: { api: "versions", row: versionRow, empty: "subNoVersions" }, comments: { api: "comments", row: (c) => commentNode(c, false), empty: "subNoComments" } };

  // Tembel alt sekme: ilk açılışta yüklenir, imleçle sayfalanır; hata → "Tekrar dene".
  function subPanel(kind, item) {
    const cfg = SUBS[kind];
    const box = el("div", "stack subpanel"); const list = el("ul", "sublist"); const foot = el("div", "subfoot-col");
    box.append(list, foot);
    let cursor = null, loading = false, count = 0, started = false;
    async function more() {
      if (loading) return; loading = true; foot.replaceChildren(el("p", "hint", t("loading")));
      try {
        const page = await PApi[cfg.api](item.id, { limit: 10, cursor });
        for (const row of page.items || []) { list.append(cfg.row(row)); count += 1; }
        cursor = page.nextCursor || null; foot.replaceChildren();
        if (!count) foot.append(el("p", "hint", t(cfg.empty)));
        if (cursor) foot.append(btn("btn sm full", t("loadMore"), more));
        foot.append(el("p", "hint", t("subUserContent")));
      } catch (err) { foot.replaceChildren(el("p", "hint", PUI.errText(err)), btn("btn sm", t("retry"), more)); }
      loading = false;
    }
    return { box, start() { if (!started) { started = true; more(); } } };
  }

  // Etkileşim satırı (ayrıntı): tepki, kaydet, koleksiyon, yazarı takip, "Çalıştı mı?". Kapsam yoksa tek satırlık "izni aç" çağrısı.
  async function paintEngage(host, item, opts) {
    host.replaceChildren();
    if (!env.signed || item.own || item.source === "mine" || item.source === "drafts" || !isPublicItem(item)) return;
    if (!env.interact) {
      const box = el("div", "engoff");
      box.append(el("p", "hint", t("engNeedScope")), btn("btn sm", t("engEnable"), () => guarded(async () => {
        // Yeniden bağlanınca onay sayfası açılır; "etkileşim" anahtarını kullanıcı işaretler. Dönünce kapsam yeniden okunur ve satır kendini yeniler.
        const res = await PUI.bg({ type: "connect" }); if (res && res.error) throw res.error;
        await loadEnv(); PEngage.reset(); await paintEngage(host, item, opts);
      })));
      host.append(box); return;
    }
    await PEngage.load([item.id]);
    const run = (fn) => guarded(async () => { await fn(); if (opts.onEngageChange) opts.onEngageChange(item); });
    const render = () => {
      host.replaceChildren();
      const s = PEngage.get(item.id);
      if (!s || s.authorUsername === env.me) return;
      const reacts = el("div", "reacts"); reacts.setAttribute("role", "group"); reacts.setAttribute("aria-label", t("engReact"));
      for (const k of PEngage.REACTIONS) {
        const b = btn("rbtn" + (s.reaction === k ? " on" : ""), PEngage.emojiOf(k), () => run(() => PEngage.react(item.id, s.reaction === k ? null : k)));
        b.title = t(`react_${k}`); b.setAttribute("aria-label", t(`react_${k}`)); b.setAttribute("aria-pressed", String(s.reaction === k)); reacts.append(b);
      }
      const row2 = el("div", "engrow");
      const save = btn("btn sm" + (s.saved ? " on" : ""), "", () => run(() => PEngage.save(item.id, !s.saved)));
      save.innerHTML = icon("bookmark"); save.append(document.createTextNode(t(s.saved ? "engSaved" : "engSave"))); save.setAttribute("aria-pressed", String(s.saved));
      const col = btn("btn sm", "", (e) => collectionsMenu(e.currentTarget, item, run));
      col.innerHTML = icon("folder"); col.append(document.createTextNode(t("engCollections") + (s.collectionIds.length ? ` (${s.collectionIds.length})` : ""))); col.setAttribute("aria-haspopup", "true");
      const fol = btn("btn sm" + (s.followingAuthor ? " on" : ""), "", () => run(() => PEngage.follow(s.authorUsername, !s.followingAuthor)));
      fol.innerHTML = icon("userplus"); fol.append(document.createTextNode(t(s.followingAuthor ? "engFollowing" : "engFollow", { a: s.authorUsername }))); fol.setAttribute("aria-pressed", String(s.followingAuthor));
      row2.append(save, col, fol);
      host.append(reacts, row2);
      if (s.works.canVote || s.works.myVote !== null) {
        const w = el("div", "engrow worksvote"); w.append(el("span", "label", t("engWorksQ")));
        for (const [v, ic, key] of [[true, "thumbup", "engWorksYes"], [false, "thumbdown", "engWorksNo"]]) {
          const b = btn("btn sm" + (s.works.myVote === v ? " on" : ""), "", () => run(() => PEngage.works(item.id, s.works.myVote === v ? null : v)));
          b.innerHTML = icon(ic); b.append(document.createTextNode(t(key))); b.setAttribute("aria-pressed", String(s.works.myVote === v)); w.append(b);
        }
        host.append(w);
      } else host.append(el("p", "hint", t("engWorksCopyFirst")));
    };
    const off = PEngage.on((id) => { if (!host.isConnected) { off(); return; } if (id === item.id) render(); });
    render();
  }
  async function collectionsMenu(anchor, item, run) {
    let list;
    try { list = await PEngage.collections(); } catch (err) { PUI.toast(PUI.errText(err)); return; }
    popover(anchor, (m) => {
      m.append(el("div", "label", t("engCollections")));
      if (!list.length) { m.append(el("p", "hint", t("emptyCollections")), PUI.anchor(`${PUI.siteUrl()}/saved/`, t("openOnSite"), "linkbtn")); return; }
      const s = PEngage.get(item.id);
      for (const c of list) {
        const l = el("label", "chk"); const cb = el("input"); cb.type = "checkbox"; cb.checked = Boolean(s && s.collectionIds.includes(c.id));
        cb.addEventListener("change", () => run(() => PEngage.inCollection(item.id, c.id, cb.checked)).then(() => { const now = PEngage.get(item.id); cb.checked = Boolean(now && now.collectionIds.includes(c.id)); }));
        l.append(cb, document.createTextNode(c.name)); m.append(l);
      }
    });
  }

  async function openDetail(item, opts = {}) {
    closeDetail(); paneOpener = document.activeElement;
    const pane = el("aside", "detailpane"); pane.setAttribute("role", "dialog"); pane.setAttribute("aria-label", item.title);
    const head = el("div", "dhead");
    const x = btn("ico round", "", closeDetail); x.innerHTML = icon("x"); x.title = t("close"); x.setAttribute("aria-label", t("close"));
    head.append(el("h2", "dtitle", item.title), x);
    const body = el("div", "dbody");
    const art = artNode(item, true); art.append(el("span", "tchip", [typeName(item), toolName(item)].filter(Boolean).join(" · ")));
    body.append(art, metaStats(item));
    const why = reasonText(item.reason); if (why) body.append(el("p", "reason", why));
    if (item.description) body.append(el("p", "cdesc full", item.description));
    const engageEl = el("div", "engage"); body.append(engageEl);
    // Sekmeler yalnız herkese açık promptta (taslak/özel için sonuç, sürüm ve yorum uçları 404 döner).
    const tabsEl = el("div", "seg dtabs"); tabsEl.setAttribute("role", "tablist");
    const panels = {};
    const promptPanel = el("div", "stack"); panels.prompt = { box: promptPanel, start() {} };
    const slot = el("div", "stack"); slot.append(el("p", "hint", t("textLoading"))); promptPanel.append(slot);
    if (isPublicItem(item)) for (const k of ["results", "versions", "comments"]) panels[k] = subPanel(k, item);
    const showTab = (name) => {
      for (const [k, p] of Object.entries(panels)) p.box.hidden = k !== name;
      tabsEl.querySelectorAll("button").forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle("on", on); b.setAttribute("aria-selected", String(on)); });
      panels[name].start();
    };
    if (Object.keys(panels).length > 1) {
      for (const k of Object.keys(panels)) { const b = btn("", t({ prompt: "subPrompt", results: "subResults", versions: "subVersions", comments: "subComments" }[k]), () => showTab(k)); b.dataset.tab = k; b.setAttribute("role", "tab"); tabsEl.append(b); }
      body.append(tabsEl);
    }
    for (const p of Object.values(panels)) body.append(p.box);
    pane.append(head, body);
    pane.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeDetail(); } });
    document.body.append(pane); x.focus();
    if (Object.keys(panels).length > 1) showTab("prompt");
    paintEngage(engageEl, item, opts);
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
    promptPanel.append(acts);
    const foot = el("div", "dfoot");
    foot.append(PRunUI.splitButton(async (id) => { await PRunUI.runItem(item, { values, selection: opts.selection, platformId: id, force: true }); }));
    pane.append(foot);
  }

  return { env, loadEnv, createFeed, createLibraryView, openDetail, closeDetail, card, row, quickRun, quickCopy };
})();
