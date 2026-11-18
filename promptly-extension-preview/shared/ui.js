// Popup ve yan panelin ortak parçaları: ikonlar, marka, kütüphane/taslak/bekleyen satırları, bildirim.
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
    upload: '<path d="M12 16V5M7 10l5-5 5 5M5 19h14"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${PATHS[n] || ""}</svg>`;
  const brand = (size = 24) => `<svg width="${size}" height="${size}" viewBox="8 8 48 48" aria-hidden="true"><g fill="none" stroke="var(--primary)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"><path d="M25 13c-6 0-7.5 3-7.5 8v5.5c0 3.5-2 5.5-5.5 5.5 3.5 0 5.5 2 5.5 5.5V43c0 5 1.5 8 7.5 8"/><path d="M39 13c6 0 7.5 3 7.5 8v5.5c0 3.5 2 5.5 5.5 5.5-3.5 0-5.5 2-5.5 5.5V43c0 5-1.5 8-7.5 8"/></g><path d="M32 41.5c-1-.8-9-6.4-9-12.2a4.6 4.6 0 0 1 9-1.5a4.6 4.6 0 0 1 9 1.5c0 5.8-8 11.4-9 12.2z" fill="var(--heart)" stroke="var(--heart)" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const typeKey = { image: "typeImage", text: "typeText", audio: "typeAudio", video: "typeVideo" };
  const srcKey = { own: "srcOwn", saved: "srcSaved", popular: "srcPopular" };

  // Prompt metnini {değişken}leri turuncu vurgulayarak bir öğeye yazar (DOM ile; HTML enjekte edilmez).
  function writePrompt(node, text) {
    node.replaceChildren();
    let last = 0;
    for (const m of text.matchAll(/\{([^{}\s][^{}]{0,38})\}/g)) {
      node.append(text.slice(last, m.index));
      node.append(el("span", "var", m[0]));
      last = m.index + m[0].length;
    }
    node.append(text.slice(last));
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }

  function toast(msg) {
    document.querySelectorAll(".toast").forEach((n) => n.remove());
    const n = el("div", "toast", msg);
    n.setAttribute("role", "status");
    document.body.append(n);
    setTimeout(() => n.remove(), 2200);
  }

  // Kütüphane satırı: dokununca açılır (prompt metni), kopyala simgesi metni panoya alır ve "az önce kullanılan" yapar.
  function libraryRow(item, state, rerender) {
    const li = el("li", "row" + (state.open === item.id ? " open" : ""));
    const tile = el("span", "tile"); tile.innerHTML = icon(item.type);
    const main = el("button", "main"); main.type = "button";
    main.setAttribute("aria-expanded", String(state.open === item.id));
    main.append(el("span", "t", item.title));
    const meta = el("span", "m");
    meta.append(el("span", "pill", t(typeKey[item.type])));
    if (item.tool) meta.append(el("span", "", item.tool));
    meta.append(el("span", "", t(srcKey[item.source])));
    if (item.score != null) meta.append(el("span", "pill ok", t("worked", { n: item.score })));
    main.append(meta);
    if (state.open === item.id) {
      const d = el("div", "detail");
      const code = el("div", "code"); writePrompt(code, item.text);
      d.append(code);
      main.append(d);
    }
    main.addEventListener("click", () => { state.open = state.open === item.id ? null : item.id; rerender(); });
    const cp = el("button", "ico"); cp.type = "button"; cp.innerHTML = icon("copy");
    cp.title = t("copy"); cp.setAttribute("aria-label", t("copy") + ": " + item.title);
    cp.addEventListener("click", async () => {
      await copyText(item.text);
      await PStore.markUsed(item.id);
      toast(t("copied"));
    });
    li.append(tile, main, cp);
    return li;
  }

  function draftRow(d, kind) {
    const li = el("li", "row");
    const tile = el("span", "tile"); tile.innerHTML = icon(d.type || "text");
    const main = el("div", "main");
    main.append(el("span", "t", d.title));
    const meta = el("span", "m");
    meta.append(el("span", kind === "pending" ? "pill warn" : "pill", kind === "pending" ? t("waitingSince", { when: PI.when(d.createdAt) }) : t("savedAt", { when: PI.when(d.createdAt) })));
    if (d.origin === "external") meta.append(el("span", "", t("external")));
    main.append(meta);
    if (kind === "draft") {
      const a = el("a", "", t("openOnSite")); a.href = PStore.SITE; a.target = "_blank"; a.rel = "noopener noreferrer";
      a.style.cssText = "color:var(--primary);font-size:12px;font-weight:500";
      main.append(a);
    }
    const rm = el("button", "ico"); rm.type = "button"; rm.innerHTML = icon("x");
    rm.title = t("remove"); rm.setAttribute("aria-label", t("remove") + ": " + d.title);
    rm.addEventListener("click", () => PStore.undoCapture(d.id));
    li.append(tile, main, rm);
    return li;
  }

  function filterLibrary(lib, query, type) {
    const q = (query || "").trim().toLowerCase();
    return lib.filter((p) => (type === "all" || p.type === type) && (!q || (p.title + " " + p.text + " " + (p.tags || []).join(" ") + " " + (p.tool || "")).toLowerCase().includes(q)));
  }

  async function applyLang(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((n) => { n.textContent = t(n.dataset.i18n); });
    root.querySelectorAll("[data-i18n-ph]").forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
    root.querySelectorAll("[data-i18n-title]").forEach((n) => { n.title = t(n.dataset.i18nTitle); n.setAttribute("aria-label", t(n.dataset.i18nTitle)); });
    document.documentElement.lang = PI.getLang();
  }
  return { icon, brand, el, t, writePrompt, copyText, toast, libraryRow, draftRow, filterLibrary, applyLang, typeKey };
})();
