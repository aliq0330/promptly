// Promptly uzantısı — "Çalıştır": prompt'u bir yapay zekâ sitesine götürür. Hiçbir yolda OTOMATİK GÖNDERİLMEZ (kullanıcı Enter'a basar).
// Üç yol, sırayla: (1) açık sekme hedef siteyse giriş kutusuna yazar (`activeTab`/site izni; mevcut yazının SONUNA ekler, silmez),
// (2) sitenin adres parametresi varsa yeni sekmede açar, (3) ikisi de yoksa kopyalar ve siteyi açar.
// Adres parametreleri ve giriş kutusu seçicileri sitelerin kendi arayüzüne bağlıdır ve zamanla değişebilir: yazma başarısız olursa kopyalanır.
self.PPlatforms = (() => {
  const enc = encodeURIComponent;
  const MAX_URL = 6000; // çok uzun adresler sunucuda/tarayıcıda kesilir: kopyala + aç yoluna düşer
  const LIST = [
    { id: "chatgpt", name: "ChatGPT", tool: "chatgpt", hosts: ["chatgpt.com"], home: "https://chatgpt.com/", build: (t) => `https://chatgpt.com/?q=${enc(t)}`, selector: "#prompt-textarea, textarea" },
    { id: "claude", name: "Claude", tool: "claude", hosts: ["claude.ai"], home: "https://claude.ai/new", build: (t) => `https://claude.ai/new?q=${enc(t)}`, selector: '[contenteditable="true"], textarea' },
    { id: "gemini", name: "Gemini", tool: "gemini", hosts: ["gemini.google.com"], home: "https://gemini.google.com/app", build: null, selector: 'rich-textarea [contenteditable="true"], rich-textarea p, [contenteditable="true"], textarea' },
    { id: "perplexity", name: "Perplexity", tool: "perplexity", hosts: ["www.perplexity.ai", "perplexity.ai"], home: "https://www.perplexity.ai/", build: (t) => `https://www.perplexity.ai/search?q=${enc(t)}`, selector: 'textarea, [contenteditable="true"]' },
  ];
  const DEFAULT_ID = "chatgpt";
  const byId = (id) => LIST.find((p) => p.id === id) || null;
  function byUrl(url) {
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
    return LIST.find((p) => p.hosts.some((h) => host === h || host.endsWith("." + h))) || null;
  }
  // Tanıma için istenen (isteğe bağlı) site izinleri: her sitenin tüm adresleri.
  const origins = () => LIST.flatMap((p) => p.hosts.map((h) => `https://${h}/*`));

  // Karar (saf): hangi yol? `activeUrl` açık sekmenin adresi (okunamıyorsa boş).
  function plan(platform, activeUrl, text) {
    if (activeUrl) { const here = byUrl(activeUrl); if (here && here.id === platform.id) return { mode: "insert", url: null }; }
    const url = platform.build ? platform.build(String(text)) : null;
    if (url && url.length <= MAX_URL) return { mode: "open", url };
    return { mode: "copy-open", url: platform.home };
  }

  // Sayfaya enjekte edilir: TAMAMEN kendi içinde olmalı (dış değişken yok). Mevcut yazının sonuna ekler; innerHTML KULLANMAZ.
  const insertIntoPage = function (selector, text) {
    const all = Array.from(document.querySelectorAll(selector)).filter((n) => n.getClientRects().length > 0);
    const el = all.find((n) => n.tagName === "TEXTAREA" || n.isContentEditable) || all[0];
    if (!el) return { ok: false, reason: "no_field" };
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
      const cur = el.value || "";
      setter.call(el, cur ? cur + "\n\n" + text : text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* bazı alanlar desteklemez */ }
      return { ok: true };
    }
    if (el.isContentEditable) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
      const had = (el.textContent || "").trim().length > 0;
      const piece = had ? "\n\n" + text : text;
      if (document.execCommand("insertText", false, piece)) return { ok: true };
      el.textContent = (el.textContent || "") + piece;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return { ok: true };
    }
    return { ok: false, reason: "not_editable" };
  };

  // Çalıştırır. Sonuç: { mode, ok, copied, platform, reason? } — `mode`: insert | open | copy-open | copy.
  // Sıra önemli: kopyalama (kullanıcı hareketi gerektirir) yeni sekme açılmadan ÖNCE yapılır; sekme açılınca popup kapanabilir.
  async function run(id, text, deps = {}) {
    const platform = byId(id) || byId(DEFAULT_ID);
    const tabsApi = deps.tabs || chrome.tabs, scripting = deps.scripting || chrome.scripting;
    const copy = deps.copy || (async (s) => { try { await navigator.clipboard.writeText(s); return true; } catch { return false; } });
    let tab = null;
    try { [tab] = await tabsApi.query({ active: true, currentWindow: true }); } catch { /* sekme okunamadı */ }
    const p = plan(platform, tab && tab.url, text);
    if (p.mode === "insert" && tab && tab.id != null) {
      try {
        const [res] = await scripting.executeScript({ target: { tabId: tab.id }, func: insertIntoPage, args: [platform.selector, String(text)] });
        if (res && res.result && res.result.ok) return { mode: "insert", ok: true, copied: false, platform };
      } catch { /* izin yok ya da sayfa korumalı */ }
      const copied = await copy(text);
      return { mode: "copy", ok: false, copied, platform, reason: "insert_failed" };
    }
    if (p.mode === "open") { await tabsApi.create({ url: p.url }); return { mode: "open", ok: true, copied: false, platform }; }
    const copied = await copy(text);
    await tabsApi.create({ url: platform.home });
    return { mode: "copy-open", ok: copied, copied, platform };
  }

  return { LIST, DEFAULT_ID, MAX_URL, byId, byUrl, origins, plan, insertIntoPage, run };
})();
