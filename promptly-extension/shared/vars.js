// Promptly uzantısı — saf yardımcılar (DOM/ağ/depo yok): değişkenler, başlık, kaynak, dışa/içe aktarma dosyası.
// Birim testleri: promptly-extension/tests/vars.test.mjs (npm test). Sitedeki `lib/prompt-variables.ts` ve `lib/exchange` ile AYNI kurallar.
self.PVars = (() => {
  const LIMITS = { title: 200, description: 5000, promptText: 50000, tags: 20, tagLabel: 60, tools: 3, variables: 30, sourceCredit: 300, sourceUrl: 500 };
  // Değişken adı: boşluksuz, süslü parantezsiz, 1–40 karakter (veritabanı CHECK'iyle aynı).
  const VAR_RE = /\{([^{}\s]{1,40})\}/g;
  // Etiket: sitedeki BAD_TAG_PATTERN ile AYNI (`lib/exchange/prompt-format.ts`).
  const BAD_TAG = /[<>\u0000-\u001f\u007f]/u;

  function variablesOf(text) {
    const seen = [];
    for (const m of String(text).matchAll(VAR_RE)) if (!seen.includes(m[1])) seen.push(m[1]);
    return seen;
  }
  function fill(text, values) {
    return String(text).replace(VAR_RE, (all, name) => (values && values[name] ? values[name] : all));
  }
  // Değişken değerleri: kullanıcının yazdığı (boş olmayan) değer, yoksa varsayılan, yoksa jeton olduğu gibi kalır.
  function resolve(text, variables, values) {
    const merged = {};
    for (const v of variables || []) if (v && v.defaultValue) merged[v.name] = v.defaultValue;
    for (const k of Object.keys(values || {})) if (values[k]) merged[k] = values[k];
    return fill(text, merged);
  }
  const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, "_");
  // "[konu]" ve "{{konu}}" kalıplarını {konu} yapar; "[2]" gibi kaynakça işaretlerine ve boş kalıplara dokunmaz.
  function autoVariables(text) {
    const made = [];
    let out = String(text).replace(/\{\{\s*([^{}\s][^{}]{0,29}?)\s*\}\}/g, (a, n) => { const v = slug(n); made.push(v); return "{" + v + "}"; });
    out = out.replace(/\[([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü0-9 _-]{0,29})\]/g, (a, n) => { const v = slug(n); made.push(v); return "{" + v + "}"; });
    return { text: out, made: [...new Set(made)] };
  }
  // Sitenin adından araç kimliği (katalog kimlikleri). Bilinmiyorsa boş.
  function guessTool(host) {
    const h = String(host || "").toLowerCase();
    const table = [["midjourney", "midjourney"], ["chatgpt", "chatgpt"], ["openai", "chatgpt"], ["claude.ai", "claude"], ["gemini", "gemini"], ["suno", "suno"], ["udio", "udio"], ["perplexity", "perplexity"], ["deepseek", "deepseek"], ["runwayml", "runway"], ["elevenlabs", "elevenlabs"], ["ideogram", "ideogram"], ["lumalabs", "luma"], ["klingai", "kling"], ["flux", "flux"], ["grok", "grok"]];
    for (const [needle, id] of table) if (h.includes(needle)) return id;
    return "";
  }
  const TYPE_OF_TOOL = { midjourney: "image", "gpt-image": "image", flux: "image", imagen: "image", "nano-banana": "image", ideogram: "image", veo: "video", runway: "video", kling: "video", luma: "video", seedance: "video", suno: "audio", udio: "audio", elevenlabs: "audio" };
  const typeOfTool = (id) => TYPE_OF_TOOL[id] || "text";
  function guessTitle(text) {
    const first = String(text).split("\n").find((l) => l.trim()) || "";
    const s = first.trim();
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }
  function hostOf(url) {
    try { return new URL(url).hostname; } catch { return ""; }
  }
  const httpUrl = (url) => (/^https?:\/\/[^\s<>"']+$/i.test(String(url || "").trim()) && String(url).trim().length <= LIMITS.sourceUrl ? String(url).trim() : null);
  // Görsel yüklemesini sunucu yapar ve yalnız herkese açık https adreslerini indirir (SSRF koruması); data:/blob:/http reddedilir.
  function imageUploadable(url) {
    try { const u = new URL(url); return u.protocol === "https:" && (u.port === "" || u.port === "443") && !!u.hostname && String(url).length <= 2048; } catch { return false; }
  }
  const clamp = (s, n) => (s.length > n ? s.slice(0, n) : s);
  function cleanTag(raw) {
    const v = String(raw).trim().replace(/^#/, "").replace(/\s+/g, " ").toLowerCase();
    return v && v.length <= LIMITS.tagLabel && !BAD_TAG.test(v) ? v : "";
  }

  // POST /v1/me/prompts gövdesi (Promptly "prompts" dosyası). Sunucu hep ÖZEL TASLAK yazar; yayınlama yoktur.
  function buildPromptsFile(draft, nowIso) {
    const text = String(draft.text || "").trim();
    const tags = [];
    for (const t of draft.tags || []) { const c = cleanTag(t); if (c && !tags.includes(c)) tags.push(c); }
    const tools = [...new Set((draft.tools || []).filter((t) => /^[a-z0-9][a-z0-9_.-]{0,59}(:[A-Za-z0-9][A-Za-z0-9_.-]{0,59})?$/.test(t)))].slice(0, LIMITS.tools);
    const variables = variablesOf(text).slice(0, LIMITS.variables).map((name) => ({ name, defaultValue: "", description: null, type: "text", options: [], config: {} }));
    const type = ["image", "text", "audio", "video"].includes(draft.type) ? draft.type : "text";
    const item = {
      title: clamp((draft.title || guessTitle(text)).trim(), LIMITS.title),
      description: clamp(String(draft.description || "").trim(), LIMITS.description),
      promptText: text,
      contentType: type,
      category: null,
      subcategory: null,
      tools,
      tags: tags.slice(0, LIMITS.tags),
      variables,
    };
    if (draft.origin === "external") {
      const url = httpUrl(draft.sourceUrl);
      const host = url ? hostOf(url) : "";
      const credit = clamp([host, String(draft.sourceTitle || "").trim()].filter(Boolean).join(" — "), LIMITS.sourceCredit);
      if (url || credit) item.source = { credit: credit || null, url };
    }
    return { format: "promptly.prompts", schemaVersion: 1, exportedAt: nowIso || new Date().toISOString(), items: [item] };
  }

  // "/" ile palet: yalnız alan boşken ya da imleçten önceki karakter boşluk/satır sonuyken tetiklenir.
  function slashAllowed(textBeforeCaret) {
    return textBeforeCaret === "" || /\s$/.test(textBeforeCaret);
  }
  // Sunucudan gelen import raporundan (items[0]) sonuç çıkarır.
  function readImportReport(report) {
    const item = report && Array.isArray(report.items) ? report.items[0] : null;
    if (!item) return { status: "unknown" };
    if (item.status === "ok") return { status: "ok", id: item.id || null, warnings: item.warnings || [] };
    if (item.status === "duplicate") return { status: "duplicate", id: item.id || null };
    return { status: "invalid", field: item.field || "", code: item.code || "" };
  }
  return { LIMITS, VAR_RE, variablesOf, fill, resolve, autoVariables, guessTool, typeOfTool, guessTitle, hostOf, httpUrl, imageUploadable, cleanTag, buildPromptsFile, slashAllowed, readImportReport };
})();
