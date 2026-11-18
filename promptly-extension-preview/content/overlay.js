// Promptly uzantısı (önizleme) — sayfaya enjekte edilen katman: yakalama kartı + prompt paleti.
// Shadow DOM içinde çizilir (sayfanın CSS'i karışmaz, bizimki sayfaya sızmaz). Kalıcı sayfa erişimi yoktur:
// background yalnız kullanıcı bir eylem yapınca (sağ tık / kısayol, activeTab) bu dosyayı enjekte eder.
(() => {
  const g = self;
  if (g.__plyOverlay) return;
  const t = (k, p) => PI.t(k, p);

  const CSS = `
  .layer { --bg:#f8f8fb; --surface:#fff; --soft:#f0f0f5; --text:#121218; --text2:#464854; --muted:#62646f; --border:#e4e4ec; --bs:#cfd0dc;
    --primary:#3b5be2; --primary-hover:#2e4bc9; --psoft:#eceffd; --pfg:#fff; --secondary:#a64718; --heart:#d86934;
    --success:#136f37; --ssoft:#e3f4e9; --warning:#a24a06; --wsoft:#fbeedd; --danger:#bd2828;
    --shadow:0 2px 4px rgba(18,18,24,.08),0 16px 48px rgba(18,18,24,.22);
    --font:"DM Sans",system-ui,-apple-system,"Segoe UI",sans-serif; --mono:ui-monospace,"JetBrains Mono",Menlo,Consolas,monospace;
    font:400 13px/1.5 var(--font); color:var(--text); position:fixed; inset:0; pointer-events:none; }
  @media (prefers-color-scheme: dark) { .layer { --bg:#0b0a0f; --surface:#16151c; --soft:#1e1d26; --text:#f3f3f7; --text2:#c8c8d3; --muted:#9a9aaa; --border:#2a2933; --bs:#3a3946;
    --primary:#738cf0; --primary-hover:#93a6f4; --psoft:#1c2142; --pfg:#0b0a0f; --secondary:#f29051; --heart:#f29051;
    --success:#4ade80; --ssoft:#11291a; --warning:#fbbf24; --wsoft:#2e2208; --danger:#f87171; --shadow:0 2px 4px rgba(0,0,0,.5),0 16px 48px rgba(0,0,0,.6); } }
  * { box-sizing:border-box; }
  button { font:inherit; color:inherit; cursor:pointer; }
  input, textarea { font:inherit; color:var(--text); }
  :focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
  .card, .pal { pointer-events:auto; background:var(--surface); border:1px solid var(--bs); border-radius:16px; box-shadow:var(--shadow); overflow:hidden; }
  .card { position:absolute; top:16px; right:16px; width:min(392px,calc(100vw - 32px)); max-height:calc(100vh - 32px); display:flex; flex-direction:column; }
  .head { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--border); }
  .wm { font-weight:800; letter-spacing:-.045em; font-size:17px; line-height:1; }
  .hint { font-size:11.5px; color:var(--muted); }
  .grow { flex:1; }
  .x { width:28px; height:28px; border-radius:50%; border:0; background:var(--soft); display:grid; place-items:center; color:var(--text2); }
  .scroll { overflow:auto; padding:14px; display:flex; flex-direction:column; gap:14px; }
  .fl { display:flex; flex-direction:column; gap:6px; }
  .lab { font-size:12px; font-weight:600; color:var(--muted); display:flex; justify-content:space-between; gap:8px; }
  .in, .ta { width:100%; border:1px solid var(--bs); border-radius:12px; background:var(--surface); padding:9px 12px; outline:0; }
  .in:focus, .ta:focus { border-color:var(--primary); }
  .ta { font-family:var(--mono); font-size:12px; line-height:1.6; resize:vertical; min-height:96px; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 12px; border-radius:999px; border:1px solid var(--bs); background:var(--surface); color:var(--text2); font-size:12px; font-weight:500; white-space:nowrap; }
  .chip.on { background:var(--psoft); border-color:var(--psoft); color:var(--primary); font-weight:600; }
  .chip.tag { background:var(--soft); border-color:var(--soft); }
  .var { color:var(--secondary); font-weight:500; font-family:var(--mono); font-size:12px; }
  .vars { display:flex; gap:6px; flex-wrap:wrap; align-items:center; font-size:12px; color:var(--muted); }
  .note { font-size:11.5px; color:var(--muted); }
  .link { background:none; border:0; padding:0; color:var(--primary); font-size:11.5px; font-weight:500; text-decoration:underline; }
  .radio { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:var(--surface); text-align:left; width:100%; }
  .radio.on { border-color:var(--primary); background:var(--psoft); }
  .radio i { width:16px; height:16px; border-radius:50%; border:2px solid var(--bs); flex:none; margin-top:2px; }
  .radio.on i { border-color:var(--primary); background:radial-gradient(var(--primary) 0 40%, transparent 45%); }
  .img { display:flex; gap:12px; align-items:center; padding:10px; border:1px solid var(--border); border-radius:12px; }
  .img img { width:64px; height:64px; border-radius:10px; object-fit:cover; background:var(--soft); flex:none; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:40px; padding:0 18px; border-radius:999px; border:1px solid var(--bs); background:var(--surface); font-weight:600; white-space:nowrap; }
  .btn.pri { background:var(--primary); border-color:var(--primary); color:var(--pfg); }
  .btn.pri:hover { background:var(--primary-hover); }
  .btn.sm { height:32px; padding:0 14px; font-size:12px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .actions .pri { flex:1; }
  .err { color:var(--danger); font-size:12px; }
  .done { padding:22px 18px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
  .done .tick { width:36px; height:36px; border-radius:50%; background:var(--ssoft); color:var(--success); display:grid; place-items:center; }
  .done h2 { margin:0; font-size:17px; }
  .done p { margin:0; color:var(--text2); }
  svg.i { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
  /* palet */
  .bd { position:absolute; inset:0; pointer-events:auto; background:rgba(10,10,15,.28); }
  .pal { position:absolute; left:50%; top:12vh; transform:translateX(-50%); width:min(760px,calc(100vw - 32px)); max-height:76vh; display:flex; flex-direction:column; }
  .pal .top { padding:12px; border-bottom:1px solid var(--border); }
  .pal .grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); min-height:240px; overflow:hidden; }
  .pal .left { overflow:auto; padding:8px; display:flex; flex-direction:column; gap:4px; border-right:1px solid var(--border); max-height:50vh; }
  .pal .right { overflow:auto; padding:14px; display:flex; flex-direction:column; gap:10px; max-height:50vh; }
  .it { text-align:left; border:0; background:transparent; border-radius:10px; padding:8px 10px; display:flex; flex-direction:column; gap:2px; width:100%; }
  .it.on { background:var(--psoft); }
  .it b { font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .it span { font-size:11.5px; color:var(--muted); }
  .code { font-family:var(--mono); font-size:12px; line-height:1.6; padding:10px 12px; border-radius:10px; background:var(--soft); white-space:pre-wrap; overflow-wrap:anywhere; }
  .pal .foot { padding:8px 14px; border-top:1px solid var(--border); font-size:11.5px; color:var(--muted); }
  .toast { pointer-events:auto; position:absolute; left:50%; bottom:24px; transform:translateX(-50%); background:var(--text); color:var(--bg); padding:9px 16px; border-radius:999px; font-weight:600; box-shadow:var(--shadow); }
  @media (max-width:640px) { .pal .grid { grid-template-columns:1fr; } .pal .left { border-right:0; border-bottom:1px solid var(--border); max-height:30vh; } }
  @media (prefers-reduced-motion:no-preference) { .card, .pal { animation:in .16s ease-out; } @keyframes in { from { opacity:0; transform:translateY(-6px); } } .pal { animation-name:inp; } @keyframes inp { from { opacity:0; transform:translate(-50%,-6px); } } }
  `;

  const ICONS = {
    x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  const BRAND = '<svg width="22" height="22" viewBox="8 8 48 48" aria-hidden="true"><g fill="none" stroke="var(--primary)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8"/><path d="M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8"/></g><path d="M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z" fill="var(--heart)" stroke="var(--heart)" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  let host = null, layer = null, onKey = null;

  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (cls, text, onClick) => { const b = h("button", cls, text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; };

  function unmount() {
    if (host) { host.remove(); host = null; layer = null; }
    if (onKey) { document.removeEventListener("keydown", onKey, true); onKey = null; }
  }
  function mount(escapes = true) {
    unmount();
    host = document.createElement("div");
    host.setAttribute("data-promptly-preview", "");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    const st = document.createElement("style"); st.textContent = CSS;
    layer = h("div", "layer");
    // Sayfanın kısayolları (ör. video sitelerindeki tuşlar) kartta yazarken tetiklenmesin.
    for (const ev of ["keydown", "keyup", "keypress"]) layer.addEventListener(ev, (e) => e.stopPropagation());
    shadow.append(st, layer);
    document.documentElement.append(host);
    if (escapes) {
      onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); unmount(); } };
      document.addEventListener("keydown", onKey, true);
    }
    return layer;
  }
  function toast(msg) {
    mount(false);
    const n = h("div", "toast", msg); n.setAttribute("role", "status");
    layer.append(n);
    const mine = host;
    setTimeout(() => { if (host === mine) unmount(); }, 2400);
  }

  // ---------- Yakalama kartı ----------
  async function openCapture(msg) {
    await PI.init();
    let text = (msg.text || "").trim();
    if (!text && !msg.imageUrl) text = String(window.getSelection() || "").trim();
    let hostName = "";
    try { hostName = new URL(msg.pageUrl || location.href).hostname; } catch {}
    const tool = PStore.guessTool(hostName);
    const original = text;
    const auto = PStore.autoVariables(text);
    const st = {
      title: PStore.guessTitle(auto.text) || (msg.imageUrl ? (msg.pageTitle || "").slice(0, 60) : ""),
      text: auto.text,
      autoMade: auto.made,
      type: msg.imageUrl || tool === "Midjourney" ? "image" : "text",
      tool, tags: [], whose: "external",
    };

    const root = mount();
    const card = h("div", "card"); card.setAttribute("role", "dialog"); card.setAttribute("aria-label", t("menuSaveText"));
    root.append(card);

    const head = h("div", "head");
    const brand = h("span"); brand.innerHTML = BRAND;
    const x = btn("x", ""); x.innerHTML = icon("x"); x.setAttribute("aria-label", t("close")); x.addEventListener("click", unmount);
    head.append(brand, h("span", "wm", "promptly"), h("span", "grow"), h("span", "hint", t("capDraftHint")), x);

    const body = h("div", "scroll");
    card.append(head, body);

    // başlık
    const titleIn = h("input", "in"); titleIn.value = st.title; titleIn.id = "ply-title";
    const fTitle = h("label", "fl"); fTitle.append(h("span", "lab", t("capTitle")), titleIn);
    titleIn.addEventListener("input", () => { st.title = titleIn.value; });

    // prompt + değişkenler
    const ta = h("textarea", "ta"); ta.value = st.text; ta.rows = 5; ta.spellcheck = false;
    const vars = h("div", "vars");
    const autoNote = h("div", "note");
    const fPrompt = h("div", "fl");
    const promptLab = h("span", "lab"); promptLab.append(h("span", "", t("capPrompt")), vars);
    fPrompt.append(promptLab, ta, autoNote);
    function paintVars() {
      const list = PStore.variablesOf(ta.value);
      vars.replaceChildren();
      if (!list.length) { vars.append(t("capVarsNone")); return; }
      vars.append(t("capVarsFound", { n: list.length }) + ":");
      list.forEach((v) => vars.append(h("span", "var", "{" + v + "}")));
    }
    function paintAuto() {
      autoNote.replaceChildren();
      if (!st.autoMade.length) return;
      autoNote.append(t("capVarsAuto", { list: st.autoMade.map((v) => "{" + v + "}").join(", ") }) + " ");
      autoNote.append(btn("link", t("capUndo"), () => { ta.value = original; st.autoMade = []; paintAuto(); paintVars(); }));
    }
    ta.addEventListener("input", () => { st.text = ta.value; st.autoMade = []; autoNote.replaceChildren(); paintVars(); });
    paintVars(); paintAuto();

    // görsel
    let fImg = null;
    if (msg.imageUrl) {
      fImg = h("div", "fl");
      const box = h("div", "img"); const im = h("img"); im.src = msg.imageUrl; im.alt = "";
      const info = h("div", "note", t("capImageNote"));
      box.append(im, info); fImg.append(h("span", "lab", t("capImage")), box);
    }

    // tür
    const typeBox = h("div", "chips");
    const types = [["image", "typeImage"], ["text", "typeText"], ["audio", "typeAudio"], ["video", "typeVideo"]];
    function paintType() { typeBox.replaceChildren(); types.forEach(([v, k]) => { const c = btn("chip" + (st.type === v ? " on" : ""), t(k), () => { st.type = v; paintType(); }); typeBox.append(c); }); }
    paintType();
    const fType = h("div", "fl"); fType.append(h("span", "lab", t("capType")), typeBox);

    // araç
    const toolBox = h("div", "chips");
    function paintTool() { toolBox.replaceChildren(); PI.TOOLS.forEach((v) => toolBox.append(btn("chip" + (st.tool === v ? " on" : ""), v, () => { st.tool = st.tool === v ? "" : v; paintTool(); }))); }
    paintTool();
    const fTool = h("div", "fl"); fTool.append(h("span", "lab", t("capTool")), toolBox);

    // etiketler
    const tagBox = h("div", "chips"); const tagIn = h("input", "in"); tagIn.placeholder = t("capTagsPh");
    function paintTags() { tagBox.replaceChildren(); st.tags.forEach((v) => tagBox.append(btn("chip tag", "#" + v + " ×", () => { st.tags = st.tags.filter((x) => x !== v); paintTags(); }))); }
    tagIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const v = tagIn.value.trim().replace(/^#/, "").toLowerCase();
        if (v && !st.tags.includes(v) && st.tags.length < 10) { st.tags.push(v); paintTags(); }
        tagIn.value = "";
      }
    });
    const fTags = h("div", "fl"); fTags.append(h("span", "lab", t("capTags")), tagBox, tagIn);

    // kimin?
    const whoseBox = h("div", "fl");
    const srcNote = h("div", "note");
    function paintWhose() {
      whoseBox.replaceChildren();
      const mk = (v, label) => { const r = btn("radio" + (st.whose === v ? " on" : ""), "", () => { st.whose = v; paintWhose(); }); r.setAttribute("role", "radio"); r.setAttribute("aria-checked", String(st.whose === v)); r.append(h("i"), h("span", "", label)); return r; };
      whoseBox.append(mk("mine", t("capMine")), mk("external", t("capElsewhere")));
      srcNote.textContent = st.whose === "external" ? t("capSourceNote", { src: hostName || msg.pageUrl || "" }) : "";
      whoseBox.append(srcNote);
    }
    paintWhose();
    const fWhose = h("div", "fl"); fWhose.append(h("span", "lab", t("capWhose")), whoseBox);

    const err = h("div", "err"); err.setAttribute("role", "alert");
    const save = btn("btn pri", t("capSave"));
    const cancel = btn("btn", t("cancel"), unmount);
    const actions = h("div", "actions"); actions.append(save, cancel);
    const hint = h("div", "note", t("capNoPublish"));

    body.append(fTitle, fPrompt);
    if (fImg) body.append(fImg);
    body.append(fType, fTool, fTags, fWhose, err, actions, hint);

    save.addEventListener("click", async () => {
      if (!st.text.trim()) { err.textContent = t("capEmpty"); ta.focus(); return; }
      err.textContent = "";
      const draft = {
        title: (st.title || PStore.guessTitle(st.text)).trim(), text: st.text.trim(), type: st.type, tool: st.tool, tags: st.tags,
        origin: st.whose === "mine" ? "own" : "external",
        sourceUrl: st.whose === "external" ? (msg.pageUrl || location.href) : "", sourceTitle: msg.pageTitle || "",
        imageUrl: msg.imageUrl || "",
      };
      const res = await PStore.saveCapture(draft);
      showDone(res);
    });

    function showDone(res) {
      card.replaceChildren(head);
      const d = h("div", "done");
      const tick = h("div", "tick"); tick.innerHTML = icon("check");
      d.append(tick, h("h2", "", res.queued ? t("capQueued") : t("capSaved")));
      if (res.queued) d.append(h("p", "", t("capQueuedWhy")));
      const row = h("div", "actions");
      row.append(btn("btn sm", t("capUndo"), async () => { await PStore.undoCapture(res.id); unmount(); }));
      if (!res.queued) { const a = h("a", "btn sm pri", t("openOnSite")); a.href = PStore.SITE; a.target = "_blank"; a.rel = "noopener noreferrer"; a.style.textDecoration = "none"; row.append(a); }
      row.append(btn("btn sm", t("close"), unmount));
      d.append(row);
      card.append(d);
      const mine = host;
      setTimeout(() => { if (host === mine) unmount(); }, 12000);
    }
    titleIn.focus(); titleIn.select();
  }

  // ---------- Palet ----------
  function insertText(el, text) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const tag = el.tagName;
    if (tag === "TEXTAREA" || (tag === "INPUT" && /^(text|search|url|email|)$/.test(el.type))) {
      el.focus();
      const s = el.selectionStart == null ? el.value.length : el.selectionStart;
      const e = el.selectionEnd == null ? s : el.selectionEnd;
      el.setRangeText(text, s, e, "end");
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return true;
    }
    if (el.isContentEditable) {
      el.focus();
      if (!document.execCommand("insertText", false, text)) {
        el.textContent = (el.textContent || "") + text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      }
      return true;
    }
    return false;
  }

  async function openPalette() {
    await PI.init();
    const lastFocus = document.activeElement;
    const { library, lastUsed } = await PStore.getAll();
    const root = mount();
    const bd = h("div", "bd"); bd.addEventListener("click", unmount); root.append(bd);
    const pal = h("div", "pal"); pal.setAttribute("role", "dialog"); pal.setAttribute("aria-label", t("tabLibrary"));
    root.append(pal);

    const search = h("input", "in"); search.placeholder = t("palSearchPh"); search.setAttribute("aria-label", t("palSearchPh"));
    const top = h("div", "top"); top.append(search);
    const left = h("div", "left"); const right = h("div", "right");
    const grid = h("div", "grid"); grid.append(left, right);
    const foot = h("div", "foot", t("palKeys"));
    pal.append(top, grid, foot);

    let items = [], sel = 0, values = {}, codeNode = null;
    const rank = (p) => (lastUsed && lastUsed.id === p.id ? 1000 : 0) + (p.score || 0);
    function filter() {
      const q = search.value.trim().toLowerCase();
      items = library.filter((p) => !q || (p.title + " " + p.text + " " + (p.tags || []).join(" ") + " " + (p.tool || "")).toLowerCase().includes(q)).sort((a, b) => rank(b) - rank(a));
      sel = Math.min(sel, Math.max(items.length - 1, 0));
    }
    const kinds = { image: "typeImage", text: "typeText", audio: "typeAudio", video: "typeVideo" };
    const srcs = { own: "srcOwn", saved: "srcSaved", popular: "srcPopular" };
    function paintList() {
      left.replaceChildren();
      if (!items.length) left.append(h("div", "note", t("palEmpty")));
      items.forEach((p, i) => {
        const b = btn("it" + (i === sel ? " on" : ""), "", () => { sel = i; values = {}; paintList(); paintPreview(); });
        b.tabIndex = -1;
        b.append(h("b", "", p.title), h("span", "", [t(kinds[p.type]), p.tool, t(srcs[p.source])].filter(Boolean).join(" · ")));
        left.append(b);
        if (i === sel) b.scrollIntoView({ block: "nearest" });
      });
    }
    function paintCode(p) {
      codeNode.replaceChildren();
      let last = 0;
      for (const m of p.text.matchAll(/\{([^{}\s][^{}]{0,38})\}/g)) {
        codeNode.append(p.text.slice(last, m.index));
        const v = values[m[1]];
        if (v) codeNode.append(v); else codeNode.append(h("span", "var", m[0]));
        last = m.index + m[0].length;
      }
      codeNode.append(p.text.slice(last));
    }
    async function doInsert() {
      const p = items[sel]; if (!p) return;
      const text = PStore.fill(p.text, values);
      const ok = insertText(lastFocus, text);
      await PStore.markUsed(p.id);
      if (ok) { toast(t("palInserted")); return; }
      let copied = false;
      try { await navigator.clipboard.writeText(text); copied = true; } catch {}
      toast(copied ? t("palNoField") : t("palNoField").replace(/;.*$/, ""));
    }
    function paintPreview() {
      right.replaceChildren();
      const p = items[sel]; if (!p) return;
      right.append(h("span", "lab", t("palPreview")));
      codeNode = h("div", "code"); right.append(codeNode);
      const names = PStore.variablesOf(p.text);
      if (!names.length) right.append(h("div", "note", t("palNoVars")));
      names.forEach((n) => {
        const f = h("label", "fl"); const inp = h("input", "in"); inp.value = values[n] || "";
        f.append(h("span", "lab", n), inp);
        inp.addEventListener("input", () => { values[n] = inp.value; paintCode(p); });
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); doInsert(); } });
        right.append(f);
      });
      const row = h("div", "actions");
      row.append(btn("btn sm pri", t("palInsert"), doInsert), btn("btn sm", t("copy"), async () => {
        const text = PStore.fill(p.text, values);
        try { await navigator.clipboard.writeText(text); } catch {}
        await PStore.markUsed(p.id); toast(t("copied"));
      }));
      right.append(row);
      paintCode(p);
    }
    search.addEventListener("input", () => { sel = 0; values = {}; filter(); paintList(); paintPreview(); });
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (sel < items.length - 1) { sel++; values = {}; paintList(); paintPreview(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (sel > 0) { sel--; values = {}; paintList(); paintPreview(); } }
      else if (e.key === "Enter") { e.preventDefault(); doInsert(); }
    });
    filter(); paintList(); paintPreview();
    search.focus();
  }

  g.__plyOverlay = { openCapture, openPalette, close: unmount };
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "ply:capture") openCapture(msg);
      if (msg.type === "ply:palette") openPalette();
    });
  } catch {}
  // Uzantının kendi sayfalarında (deneme sayfası) background enjekte edemez; kısayolu burada dinle.
  if (location.protocol === "chrome-extension:") {
    document.addEventListener("keydown", (e) => {
      if (!(e.altKey && e.shiftKey)) return;
      if (e.code === "KeyP") { e.preventDefault(); openPalette(); }
      if (e.code === "KeyS") { e.preventDefault(); openCapture({ text: String(window.getSelection() || ""), pageUrl: location.href, pageTitle: document.title }); }
    }, true);
  }
})();
