// Promptly uzantısı — sayfaya enjekte edilen katman: yakalama kartı + prompt paleti (+ site başına "/" tetikleyici).
// Shadow DOM içinde çizilir (sayfanın CSS'i karışmaz, bizimki sayfaya sızmaz). Bu betik depoya, belirtece ve ağa ERİŞEMEZ:
// her şeyi arka plana mesajla ister (`ply:*`). Kalıcı sayfa erişimi yoktur: arka plan bu dosyayı yalnız kullanıcı sağ tık/kısayol
// kullanınca (activeTab) ya da kullanıcının "/ ile aç" dediği sitede enjekte eder.
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
  .warn { font-size:11.5px; color:var(--warning); }
  .link { background:none; border:0; padding:0; color:var(--primary); font-size:11.5px; font-weight:500; text-decoration:underline; }
  .radio { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:var(--surface); text-align:left; width:100%; }
  .radio.on { border-color:var(--primary); background:var(--psoft); }
  .radio i { width:16px; height:16px; border-radius:50%; border:2px solid var(--bs); flex:none; margin-top:2px; }
  .radio.on i { border-color:var(--primary); background:radial-gradient(var(--primary) 0 40%, transparent 45%); }
  .img { display:flex; gap:12px; align-items:center; padding:10px; border:1px solid var(--border); border-radius:12px; }
  .img img { width:64px; height:64px; border-radius:10px; object-fit:cover; background:var(--soft); flex:none; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:40px; padding:0 18px; border-radius:999px; border:1px solid var(--bs); background:var(--surface); font-weight:600; white-space:nowrap; text-decoration:none; color:var(--text); }
  .btn.pri { background:var(--primary); border-color:var(--primary); color:var(--pfg); }
  .btn.pri:hover { background:var(--primary-hover); }
  .btn.sm { height:32px; padding:0 14px; font-size:12px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; }
  .actions .pri { flex:1; }
  .err { color:var(--danger); font-size:12px; }
  .done { padding:22px 18px; display:flex; flex-direction:column; gap:12px; align-items:flex-start; }
  .done .tick { width:36px; height:36px; border-radius:50%; background:var(--ssoft); color:var(--success); display:grid; place-items:center; }
  .done .tick.warn { background:var(--wsoft); color:var(--warning); }
  .done h2 { margin:0; font-size:17px; }
  .done p { margin:0; color:var(--text2); }
  svg.i { width:16px; height:16px; fill:none; stroke:currentColor; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
  .bd { position:absolute; inset:0; pointer-events:auto; background:rgba(10,10,15,.28); }
  .pal { position:absolute; left:50%; top:12vh; transform:translateX(-50%); width:min(760px,calc(100vw - 32px)); max-height:76vh; display:flex; flex-direction:column; }
  .pal .top { padding:12px; border-bottom:1px solid var(--border); display:flex; flex-direction:column; gap:8px; }
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
  @media (prefers-reduced-motion:no-preference) { .card { animation:in .16s ease-out; } @keyframes in { from { opacity:0; transform:translateY(-6px); } } .pal { animation:inp .16s ease-out; } @keyframes inp { from { opacity:0; transform:translate(-50%,-6px); } } }
  `;
  const ICONS = { x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>' };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  const BRAND = '<svg width="22" height="22" viewBox="8 8 48 48" aria-hidden="true"><g fill="none" stroke="var(--primary)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8"/><path d="M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8"/></g><path d="M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z" fill="var(--heart)" stroke="var(--heart)" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  let host = null, layer = null, onKey = null, timers = [];
  const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (cls, text, onClick) => { const b = h("button", cls, text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; };

  async function rpc(msg) {
    try { return (await chrome.runtime.sendMessage(msg)) || { error: { code: "error" } }; }
    catch { return { error: { code: "offline", message: "extension" } }; }
  }
  async function loadState() {
    const st = await rpc({ type: "ply:state", origin: location.origin });
    if (!st.error) PI.use(st.lang);
    return st;
  }
  function errText(e) {
    const c = e && e.code;
    if (c === "offline") return t("errOffline");
    if (c === "unauthorized") return t("errUnauthorized");
    if (c === "insufficient_scope") return t("errScope");
    if (c === "rate_limited") return t("errRate");
    if (c === "server") return t("errServer");
    if (c === "invalid") return e.message === "too_long" ? t("capTooLong") : e.message === "empty" ? t("capEmpty") : t("errInvalid", { detail: [e.field, e.detail].filter(Boolean).join(" · ") || e.message || "" });
    return (e && e.message) || t("errGeneric");
  }

  function unmount() {
    timers.forEach(clearInterval); timers = [];
    if (host) { host.remove(); host = null; layer = null; }
    if (onKey) { document.removeEventListener("keydown", onKey, true); onKey = null; }
  }
  function mount(onEscape) {
    unmount();
    host = document.createElement("div");
    host.setAttribute("data-promptly", "");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    const st = document.createElement("style"); st.textContent = CSS;
    layer = h("div", "layer");
    // Sayfanın kısayolları (ör. video sitelerindeki tuşlar) kartta yazarken tetiklenmesin.
    for (const ev of ["keydown", "keyup", "keypress"]) layer.addEventListener(ev, (e) => e.stopPropagation());
    shadow.append(st, layer);
    document.documentElement.append(host);
    onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); if (onEscape) onEscape(); else unmount(); } };
    document.addEventListener("keydown", onKey, true);
    return layer;
  }
  function toast(msg) {
    mount();
    layer.append(Object.assign(h("div", "toast", msg), {}));
    layer.lastChild.setAttribute("role", "status");
    const mine = host;
    setTimeout(() => { if (host === mine) unmount(); }, 2400);
  }

  // ---------- Yakalama kartı ----------
  async function openCapture(msg) {
    const state = await loadState();
    let text = (msg.text || "").trim();
    if (!text && !msg.imageUrl) text = String(window.getSelection() || "").trim();
    const pageUrl = msg.pageUrl || location.href;
    const hostName = PVars.hostOf(pageUrl);
    const toolGuess = PVars.guessTool(hostName);
    const original = text;
    const auto = PVars.autoVariables(text);
    const st = {
      title: PVars.guessTitle(auto.text) || (msg.imageUrl ? (msg.pageTitle || "").slice(0, 60) : ""),
      text: auto.text, autoMade: auto.made,
      type: msg.imageUrl ? "image" : toolGuess ? PVars.typeOfTool(toolGuess) : "text",
      tools: [], tags: [], whose: "external",
    };
    if (toolGuess && (PI.TOOLS_BY_TYPE[st.type] || []).includes(toolGuess)) st.tools = [toolGuess];

    const root = mount();
    const card = h("div", "card"); card.setAttribute("role", "dialog"); card.setAttribute("aria-label", t("menuSaveText"));
    root.append(card);
    const head = h("div", "head");
    const brand = h("span"); brand.innerHTML = BRAND;
    const x = btn("x", ""); x.innerHTML = icon("x"); x.setAttribute("aria-label", t("close")); x.addEventListener("click", unmount);
    head.append(brand, h("span", "wm", "promptly"), h("span", "grow"), h("span", "hint", t("capDraftHint")), x);
    const body = h("div", "scroll");
    card.append(head, body);

    const titleIn = h("input", "in"); titleIn.value = st.title;
    const fTitle = h("label", "fl"); fTitle.append(h("span", "lab", t("capTitle")), titleIn);
    titleIn.addEventListener("input", () => { st.title = titleIn.value; });

    const ta = h("textarea", "ta"); ta.value = st.text; ta.rows = 5; ta.spellcheck = false;
    const vars = h("div", "vars"); const autoNote = h("div", "note");
    const fPrompt = h("div", "fl"); const promptLab = h("span", "lab"); promptLab.append(h("span", "", t("capPrompt")), vars);
    fPrompt.append(promptLab, ta, autoNote);
    const paintVars = () => {
      const list = PVars.variablesOf(ta.value); vars.replaceChildren();
      if (!list.length) { vars.append(t("capVarsNone")); return; }
      vars.append(t("capVarsFound", { n: list.length }) + ":"); list.forEach((v) => vars.append(h("span", "var", "{" + v + "}")));
    };
    const paintAuto = () => {
      autoNote.replaceChildren(); if (!st.autoMade.length) return;
      autoNote.append(t("capVarsAuto", { list: st.autoMade.map((v) => "{" + v + "}").join(", ") }) + " ");
      autoNote.append(btn("link", t("capUndoVars"), () => { ta.value = original; st.text = original; st.autoMade = []; paintAuto(); paintVars(); }));
    };
    ta.addEventListener("input", () => { st.text = ta.value; st.autoMade = []; autoNote.replaceChildren(); paintVars(); });
    paintVars(); paintAuto();

    let fImg = null;
    if (msg.imageUrl) {
      fImg = h("div", "fl");
      const box = h("div", "img"); const im = h("img"); im.src = msg.imageUrl; im.alt = "";
      const ok = PVars.imageUploadable(msg.imageUrl);
      box.append(im, h("div", ok ? "note" : "warn", ok ? t("capImageNote") : t("capImageNeedsHttps")));
      fImg.append(h("span", "lab", t("capImage")), box);
    }

    const typeBox = h("div", "chips");
    const toolBox = h("div", "chips");
    const types = [["image", "typeImage"], ["text", "typeText"], ["audio", "typeAudio"], ["video", "typeVideo"]];
    const paintType = () => { typeBox.replaceChildren(); types.forEach(([v, k]) => typeBox.append(btn("chip" + (st.type === v ? " on" : ""), t(k), () => { st.type = v; st.tools = st.tools.filter((x) => (PI.TOOLS_BY_TYPE[v] || []).includes(x)); paintType(); paintTool(); }))); };
    const paintTool = () => {
      toolBox.replaceChildren();
      (PI.TOOLS_BY_TYPE[st.type] || []).forEach((id) => toolBox.append(btn("chip" + (st.tools.includes(id) ? " on" : ""), PI.TOOLS[id], () => {
        if (st.tools.includes(id)) st.tools = st.tools.filter((x) => x !== id); else if (st.tools.length < PVars.LIMITS.tools) st.tools = [...st.tools, id];
        paintTool();
      })));
    };
    paintType(); paintTool();
    const fType = h("div", "fl"); fType.append(h("span", "lab", t("capType")), typeBox);
    const fTool = h("div", "fl"); fTool.append(h("span", "lab", t("capTool")), toolBox);

    const tagBox = h("div", "chips"); const tagIn = h("input", "in"); tagIn.placeholder = t("capTagsPh");
    const paintTags = () => { tagBox.replaceChildren(); st.tags.forEach((v) => tagBox.append(btn("chip tag", "#" + v + " ×", () => { st.tags = st.tags.filter((x) => x !== v); paintTags(); }))); };
    tagIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const v = PVars.cleanTag(tagIn.value);
        if (v && !st.tags.includes(v) && st.tags.length < PVars.LIMITS.tags) { st.tags.push(v); paintTags(); }
        tagIn.value = "";
      }
    });
    const fTags = h("div", "fl"); fTags.append(h("span", "lab", t("capTags")), tagBox, tagIn);

    const whoseBox = h("div", "fl"); const srcNote = h("div", "note");
    const paintWhose = () => {
      whoseBox.replaceChildren();
      const mk = (v, label) => { const r = btn("radio" + (st.whose === v ? " on" : ""), "", () => { st.whose = v; paintWhose(); }); r.setAttribute("role", "radio"); r.setAttribute("aria-checked", String(st.whose === v)); r.append(h("i"), h("span", "", label)); return r; };
      whoseBox.append(mk("mine", t("capMine")), mk("external", t("capElsewhere")));
      srcNote.textContent = st.whose === "external" ? t("capSourceNote", { src: hostName || pageUrl }) : "";
      whoseBox.append(srcNote);
    };
    paintWhose();
    const fWhose = h("div", "fl"); fWhose.append(h("span", "lab", t("capWhose")), whoseBox);

    const err = h("div", "err"); err.setAttribute("role", "alert");
    const save = btn("btn pri", t("capSave")); const cancel = btn("btn", t("cancel"), unmount);
    const actions = h("div", "actions"); actions.append(save, cancel);
    const hints = h("div", "fl"); hints.append(h("div", "note", t("capNoPublish")));
    if (!state.error && !state.signedIn) hints.append(h("div", "warn", t("capNeedSignIn")));
    else if (!state.error && !state.canWrite) hints.append(h("div", "warn", t("errScope")));
    body.append(fTitle, fPrompt); if (fImg) body.append(fImg);
    body.append(fType, fTool, fTags, fWhose, err, actions, hints);

    save.addEventListener("click", async () => {
      if (!st.text.trim()) { err.textContent = t("capEmpty"); ta.focus(); return; }
      if (st.text.length > PVars.LIMITS.promptText) { err.textContent = t("capTooLong"); return; }
      err.textContent = ""; save.disabled = true;
      const res = await rpc({ type: "ply:save", draft: { title: st.title, text: st.text, type: st.type, tools: st.tools, tags: st.tags, origin: st.whose === "mine" ? "own" : "external", sourceUrl: st.whose === "external" ? pageUrl : "", sourceTitle: msg.pageTitle || "", imageUrl: msg.imageUrl || "" } });
      if (res.error) { err.textContent = errText(res.error); save.disabled = false; return; }
      held(res);
    });

    // Gönderim kısa süre bekletilir: bu sürede "Geri al" hiçbir şey göndermez (gönderilen taslak API'den silinemez).
    function held(res) {
      card.replaceChildren(head);
      const d = h("div", "done"); const tick = h("div", "tick"); tick.innerHTML = icon("check");
      d.append(tick);
      if (!res.signedIn) {
        d.append(h("h2", "", t("capQueued")), h("p", "", t("capNeedSignIn")), btn("btn sm", t("close"), unmount));
        card.append(d); return;
      }
      const title = h("h2", "", t("capHeld")); const sub = h("p", "");
      const undo = btn("btn sm", t("capUndo"));
      d.append(title, sub, undo); card.append(d);
      const left = () => Math.max(0, Math.ceil((res.holdUntil - Date.now()) / 1000));
      sub.textContent = t("capHeldIn", { s: left() });
      let finished = false;
      undo.addEventListener("click", async () => {
        if (finished) return;
        finished = true; timers.forEach(clearInterval);
        const r = await rpc({ type: "ply:undo", id: res.id });
        d.replaceChildren(tick, h("h2", "", r.undone ? t("capUndone") : t("capSent")), btn("btn sm", t("close"), unmount));
      });
      const iv = setInterval(async () => {
        const s = left(); sub.textContent = t("capHeldIn", { s });
        if (s > 0 || finished) return;
        finished = true; clearInterval(iv);
        undo.disabled = true; sub.textContent = t("capSaving");
        await rpc({ type: "ply:flush" });
        const r = await rpc({ type: "ply:result", id: res.id });
        result(d, tick, r);
      }, 500);
      timers.push(iv);
    }
    function result(d, tick, r) {
      d.replaceChildren(tick);
      const row = h("div", "actions");
      if (r.state === "sent") {
        d.append(h("h2", "", r.duplicate ? t("capSentDup") : t("capSent")));
        if (!r.duplicate) d.append(h("p", "", t("capSentNote")));
        if (r.imageError) d.append(h("p", "warn", t("errImage", { detail: r.imageError === "https" ? t("capImageNeedsHttps") : r.imageError })));
        if (r.url) { const a = h("a", "btn sm pri", t("openOnSite")); a.href = r.url; a.target = "_blank"; a.rel = "noopener noreferrer"; row.append(a); }
      } else if (r.state === "failed") {
        tick.className = "tick warn"; tick.innerHTML = icon("alert");
        d.append(h("h2", "", t("capFailed")), h("p", "", errText(r.error || {})), h("p", "note", t("capFailedNote")));
      } else if (r.state === "queued") {
        tick.className = "tick warn"; tick.innerHTML = icon("alert");
        d.append(h("h2", "", t("capQueued")), h("p", "", r.reason ? errText(r.reason) : t("capQueuedWhy")));
      } else d.append(h("h2", "", t("capSent")));
      row.append(btn("btn sm", t("close"), unmount)); d.append(row);
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
      if (!document.execCommand("insertText", false, text)) { el.textContent = (el.textContent || "") + text; el.dispatchEvent(new InputEvent("input", { bubbles: true })); }
      return true;
    }
    return false;
  }

  async function openPalette(opts = {}) {
    const state = await loadState();
    const lastFocus = opts.field || document.activeElement;
    let inserted = false;
    const root = mount(() => { unmount(); if (opts.slash && !inserted) insertText(lastFocus, "/"); });
    const bd = h("div", "bd"); bd.addEventListener("click", () => { unmount(); if (opts.slash && !inserted) insertText(lastFocus, "/"); }); root.append(bd);
    const pal = h("div", "pal"); pal.setAttribute("role", "dialog"); pal.setAttribute("aria-label", t("tabLibrary")); root.append(pal);

    const search = h("input", "in"); search.placeholder = t("palSearchPh"); search.setAttribute("aria-label", t("palSearchPh"));
    const srcBox = h("div", "chips");
    const top = h("div", "top"); top.append(search, srcBox);
    const left = h("div", "left"); const right = h("div", "right");
    const grid = h("div", "grid"); grid.append(left, right);
    pal.append(top, grid, h("div", "foot", t("palKeys")));

    const SRC = [["recent", "srcRecent"], ["mine", "srcMine"], ["saved", "srcSaved"], ["popular", "srcPopular"], ["explore", "srcExplore"]];
    let source = "recent", items = [], sel = 0, values = {}, current = null, gen = 0, note = "";
    const cache = {};
    const kinds = { image: "typeImage", text: "typeText", audio: "typeAudio", video: "typeVideo" };

    function paintSources() {
      srcBox.replaceChildren();
      SRC.forEach(([s, k]) => srcBox.append(btn("chip" + (source === s ? " on" : ""), t(k), () => { source = s; sel = 0; load(); })));
    }
    const local = (s) => s === "recent" || s === "mine" || s === "saved";
    async function load() {
      const my = ++gen; paintSources(); note = "";
      const q = search.value.trim();
      const key = `${source}|${local(source) ? "" : q}`;
      if (!cache[key]) {
        left.replaceChildren(h("div", "note", t("loading")));
        const res = await rpc({ type: "ply:library", source, query: local(source) ? "" : q, cursor: null });
        if (my !== gen) return;
        if (res.error) { items = []; note = res.error.code === "unauthorized" ? t("palSignIn") : errText(res.error); paintList(); paintPreview(); return; }
        cache[key] = res.items;
      }
      const all = cache[key];
      items = local(source) && q ? all.filter((i) => PLibLike(i, q)) : all;
      sel = Math.min(sel, Math.max(items.length - 1, 0));
      paintList(); paintPreview();
    }
    const PLibLike = (i, q) => `${i.title} ${i.description || ""} ${i.preview || ""} ${(i.tools || []).join(" ")} ${i.author || ""}`.toLowerCase().includes(q.toLowerCase());

    function paintList() {
      left.replaceChildren();
      if (note) left.append(h("div", "note", note));
      else if (!items.length) left.append(h("div", "note", t("palEmpty")));
      items.forEach((p, i) => {
        const b = btn("it" + (i === sel ? " on" : ""), "", () => { sel = i; values = {}; paintList(); paintPreview(); });
        b.tabIndex = -1;
        const meta = [t(kinds[p.type] || "typeText"), (p.tools || []).slice(0, 1).map((x) => PI.TOOLS[String(x).split(":")[0]] || x)[0], p.author ? "@" + p.author : ""].filter(Boolean).join(" · ");
        b.append(h("b", "", p.title), h("span", "", meta));
        left.append(b);
        if (i === sel) b.scrollIntoView({ block: "nearest" });
      });
    }
    function paintCode(codeNode, text, vlist) {
      codeNode.replaceChildren();
      const merged = {}; for (const v of vlist) if (v.defaultValue) merged[v.name] = v.defaultValue; for (const k of Object.keys(values)) if (values[k]) merged[k] = values[k];
      let last = 0;
      for (const m of text.matchAll(PVars.VAR_RE)) {
        codeNode.append(text.slice(last, m.index));
        if (merged[m[1]]) codeNode.append(merged[m[1]]); else codeNode.append(h("span", "var", m[0]));
        last = m.index + m[0].length;
      }
      codeNode.append(text.slice(last));
    }
    async function finish(item, data, copyOnly) {
      const text = PVars.resolve(data.text, data.variables, values);
      let ok = false;
      if (!copyOnly) ok = insertText(lastFocus, text);
      if (ok) inserted = true;
      let copied = false;
      if (!ok) { try { await navigator.clipboard.writeText(text); copied = true; } catch { /* pano reddedildi */ } }
      if (ok || copied) rpc({ type: "ply:used", item: { id: item.id, title: item.title, type: item.type, source: item.source, own: item.source === "mine" || item.source === "drafts" || Boolean(item.own), url: item.url, author: item.author, description: item.description } });
      toast(ok ? t("palInserted") : copied ? (copyOnly ? t("copied") : t("palNoField")) : t("copyFailed"));
    }
    async function paintPreview() {
      right.replaceChildren();
      const p = items[sel]; current = p; if (!p) return;
      right.append(h("span", "lab", t("palPreview")));
      const code = h("div", "code", t("textLoading")); right.append(code);
      const res = await rpc({ type: "ply:text", item: { id: p.id, source: p.source, own: Boolean(p.own) } });
      if (current !== p) return;
      if (res.error) { code.textContent = errText(res.error); return; }
      paintCode(code, res.text, res.variables);
      const names = PVars.variablesOf(res.text);
      if (!names.length) right.append(h("div", "note", t("noVars")));
      names.forEach((n, idx) => {
        const f = h("label", "fl"); const inp = h("input", "in"); inp.value = values[n] || ""; inp.placeholder = (res.variables.find((v) => v.name === n) || {}).defaultValue || "";
        f.append(h("span", "lab", n), inp);
        inp.addEventListener("input", () => { values[n] = inp.value; paintCode(code, res.text, res.variables); });
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); finish(p, res, false); } });
        right.append(f);
        if (idx === 0 && opts.focusVars) inp.focus();
      });
      const row = h("div", "actions");
      row.append(btn("btn sm pri", t("palInsert"), () => finish(p, res, false)), btn("btn sm", t("copy"), () => finish(p, res, true)));
      right.append(row);
      right.dataset.ready = "1";
      right._insert = () => finish(p, res, false);
    }
    search.addEventListener("input", () => { sel = 0; values = {}; load(); });
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); if (sel < items.length - 1) { sel++; values = {}; paintList(); paintPreview(); } }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (sel > 0) { sel--; values = {}; paintList(); paintPreview(); } }
      else if (e.key === "Enter") { e.preventDefault(); if (right._insert) right._insert(); }
    });
    if (state.error || !state.signedIn) source = "popular";
    load();
    search.focus();
  }

  // ---------- "/" ile aç (yalnız kullanıcının izin verdiği sitelerde) ----------
  function editableOf(target) {
    const el = target && target.closest ? target : null;
    if (!el) return null;
    if (el.tagName === "TEXTAREA") return el;
    if (el.tagName === "INPUT" && /^(text|search|url|email|)$/.test(el.type)) return el;
    return el.isContentEditable ? el : null;
  }
  function textBeforeCaret(el) {
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value.slice(0, el.selectionStart == null ? el.value.length : el.selectionStart);
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return "";
    const r = sel.getRangeAt(0).cloneRange(); r.selectNodeContents(el); r.setEnd(sel.anchorNode, sel.anchorOffset);
    return r.toString();
  }
  function onSlash(e) {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    const el = editableOf(e.composedPath ? e.composedPath()[0] : e.target);
    if (!el || (host && host.contains(el))) return;
    if (!PVars.slashAllowed(textBeforeCaret(el))) return;
    e.preventDefault(); e.stopPropagation();
    openPalette({ slash: true, field: el, focusVars: true });
  }
  let slashAttached = false;
  async function setupSlash() {
    const st = await rpc({ type: "ply:state", origin: location.origin });
    if (st && st.slash && !slashAttached) { slashAttached = true; document.addEventListener("keydown", onSlash, true); }
  }

  g.__plyOverlay = { openCapture, openPalette, close: unmount };
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg) return;
      if (msg.type === "ply:capture") openCapture(msg);
      if (msg.type === "ply:palette") openPalette();
    });
  } catch { /* bağlam geçersiz */ }
  setupSlash();
})();
