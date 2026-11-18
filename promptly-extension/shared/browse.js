// Promptly uzantısı — gezinme mantığı (saf: DOM/ağ/depo yok): süzgeçler → API argümanları, Görünümlerim, slotlar, kart görseli, dışa aktarma dosyası.
// Birim testleri: promptly-extension/tests/browse.test.mjs.
self.PBrowse = (() => {
  const TYPES = ["all", "image", "text", "audio", "video"];
  const SORTS = ["relevant", "new", "popular"];
  const FILTER_KEYS = ["type", "tool", "tag", "vars"]; // ⚙ ile açılıp kapanabilen süzgeçler
  const DENSITIES = ["comfy", "tight", "list"];
  const MAX_VIEWS = 12, MAX_SLOTS = 5, VIEW_NAME_MAX = 30;
  const DEFAULT_FILTERS = { type: "all", tool: "", tag: "", vars: false };
  const DEFAULT_PREFS = { density: "comfy", shown: FILTER_KEYS.slice() };

  function cleanFilters(f) {
    const o = f && typeof f === "object" ? f : {};
    return {
      type: TYPES.includes(o.type) ? o.type : "all",
      tool: typeof o.tool === "string" && /^[a-z0-9][a-z0-9_.-]{0,59}$/.test(o.tool) ? o.tool : "",
      tag: tagSlug(o.tag),
      vars: Boolean(o.vars),
    };
  }
  // Etiket: küçük harf, boşluk → "-", site kurallarına uymayan karakter yok (sunucu ayrıca doğrular).
  function tagSlug(raw) {
    const v = PVars.cleanTag(String(raw || "")).replace(/\s+/g, "-");
    return v;
  }
  const isDefault = (f) => { const c = cleanFilters(f); return c.type === "all" && !c.tool && !c.tag && !c.vars; };
  const sameFilters = (a, b) => { const x = cleanFilters(a), y = cleanFilters(b); return x.type === y.type && x.tool === y.tool && x.tag === y.tag && x.vars === y.vars; };
  const activeCount = (f) => { const c = cleanFilters(f); return (c.type !== "all") + Boolean(c.tool) + Boolean(c.tag) + c.vars; };

  // Süzgeçler → /v1/prompts sorgusu. "Yalnız değişkenli" API'de yok: istemcide uygulanır (`clientFilter`).
  function searchArgs(filters, { query = "", cursor = null, sort = "", limit = 25 } = {}) {
    const f = cleanFilters(filters);
    return {
      q: String(query || "").trim() || undefined,
      contentType: f.type === "all" ? undefined : f.type,
      tools: f.tool ? [f.tool] : undefined,
      tags: f.tag ? [f.tag] : undefined,
      sort: SORTS.includes(sort) ? sort : undefined,
      cursor: cursor || undefined,
      limit,
    };
  }
  function clientFilter(items, filters) {
    const f = cleanFilters(filters);
    return f.vars ? items.filter((i) => Array.isArray(i.variableNames) && i.variableNames.length > 0) : items;
  }

  function cleanPrefs(p) {
    const o = p && typeof p === "object" ? p : {};
    const shown = Array.isArray(o.shown) ? FILTER_KEYS.filter((k) => o.shown.includes(k)) : FILTER_KEYS.slice();
    return { density: DENSITIES.includes(o.density) ? o.density : "comfy", shown };
  }

  // ---- Görünümlerim (kayıtlı süzgeç setleri; yalnız bu cihazda) ----
  function cleanName(s) { return String(s || "").replace(/\s+/g, " ").trim().slice(0, VIEW_NAME_MAX); }
  function addView(views, { name, tab, filters, sort }, id) {
    const n = cleanName(name);
    if (!n) return { views, error: "empty" };
    if (views.some((v) => v.name.toLowerCase() === n.toLowerCase())) return { views, error: "duplicate" };
    if (views.length >= MAX_VIEWS) return { views, error: "full" };
    const view = { id: id || String(Date.now()) + Math.random().toString(16).slice(2), name: n, tab: tab === "home" ? "home" : "discover", filters: cleanFilters(filters), sort: SORTS.includes(sort) ? sort : "" };
    return { views: [...views, view], view };
  }
  const removeView = (views, id) => views.filter((v) => v.id !== id);

  // ---- Sabit slotlar (1–5) ----
  const slimItem = (i) => ({ id: i.id, title: String(i.title || "").slice(0, 200), type: i.type || "text", source: i.source || "explore", own: Boolean(i.own || i.source === "mine" || i.source === "drafts"), url: i.url || "", author: i.author || "", description: String(i.description || "").slice(0, 300) });
  function pinSlot(slots, item) {
    const without = slots.filter((s) => s && s.id !== item.id);
    if (without.length >= MAX_SLOTS) return { slots, error: "full" };
    return { slots: [...without, slimItem(item)] };
  }
  const unpinSlot = (slots, id) => slots.filter((s) => s && s.id !== id);
  const isPinned = (slots, id) => slots.some((s) => s && s.id === id);

  // ---- Kart görseli: API görsel adresi vermez; tür + kimlikten KARARLI bir renk yüzeyi çizilir (gerçek görsel değildir) ----
  const PALETTES = [
    ["#d8c7ae", "#8f7c66"], ["#cdd6fb", "#8da2f5"], ["#f7d9c4", "#e8a77a"], ["#d9efe0", "#8fcba3"],
    ["#e3d4f1", "#a98bd1"], ["#f5e6b8", "#d6b24a"], ["#d3e6f0", "#7fb1cc"], ["#f2cfd6", "#d98a9b"],
  ];
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function artOf(item) {
    const h = hash(item.id || item.title || "");
    const [a, b] = PALETTES[h % PALETTES.length];
    const x = 15 + (h >>> 3) % 60, y = 15 + (h >>> 9) % 60;
    return { kind: item.type || "text", bg: `radial-gradient(circle at ${x}% ${y}%, ${a} 0, transparent 55%), linear-gradient(135deg, ${a}, ${b})` };
  }

  // ---- Dışa aktarma: seçilen promptlar tek "promptly.prompts" dosyası (sitenin içe aktarma biçimi) ----
  function exportFile(entries, nowIso) {
    const items = [];
    for (const e of entries) {
      const one = PVars.buildPromptsFile({ title: e.title, text: e.text, type: e.type, tools: e.tools || [], tags: e.tags || [], origin: "own" }, nowIso);
      items.push(...one.items);
    }
    return { format: "promptly.prompts", schemaVersion: 1, exportedAt: nowIso || new Date().toISOString(), items };
  }

  // Seçili metin değişkeni: bu adlardan biri {seçim} sayılır.
  const SELECTION_VARS = ["seçim", "secim", "selection"];
  const usesSelection = (names) => (names || []).some((n) => SELECTION_VARS.includes(String(n).toLowerCase()));
  function selectionValues(names, selection) {
    const out = {};
    for (const n of names || []) if (SELECTION_VARS.includes(String(n).toLowerCase())) out[n] = selection;
    return out;
  }

  return { TYPES, SORTS, FILTER_KEYS, DENSITIES, MAX_VIEWS, MAX_SLOTS, DEFAULT_FILTERS, DEFAULT_PREFS, cleanFilters, tagSlug, isDefault, sameFilters, activeCount, searchArgs, clientFilter, cleanPrefs, addView, removeView, pinSlot, unpinSlot, isPinned, slimItem, artOf, exportFile, usesSelection, selectionValues, SELECTION_VARS };
})();
