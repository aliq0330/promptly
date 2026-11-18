// Promptly uzantısı — kütüphane: kaynaklar (son kullanılan, benim, kaydettiğim, popüler, keşfet), metin getirme, çevrimdışı önbellek.
// Tek yer: popup, yan panel ve (arka plan üzerinden) sayfadaki palet bunu kullanır; ikinci bir listeleme yolu yazılmaz.
self.PLib = (() => {
  const PAGE = 25;
  const SOURCES = ["recent", "mine", "saved", "drafts", "popular", "explore", "feed_for_you", "feed_following", "collection"];
  const TEXT_CACHE_MAX = 40;
  const RECENT_MAX = 20;
  const memText = new Map();

  const typeOf = (v) => (["image", "text", "audio", "video"].includes(v) ? v : "text");
  const fromMe = (row, source) => ({ id: row.id, title: row.title || "", description: row.description || "", type: typeOf(row.contentType), source, status: row.status || "", visibility: row.visibility || "", url: row.url || "", tools: [], author: "" });
  const fromPublic = (row, source) => ({ id: row.id, title: row.title || "", description: row.description || "", type: typeOf(row.contentType), source, status: "", visibility: "", url: row.url || "", tools: row.tools || [], author: (row.author && row.author.username) || "", preview: row.promptPreview || "", variableNames: row.variableNames || [], tags: row.tags || [], stats: row.stats || null, thumbnailUrl: typeof row.thumbnailUrl === "string" ? row.thumbnailUrl : "", works: row.works || null, reason: row.reason && row.reason.kind ? { kind: String(row.reason.kind), ref: row.reason.ref || null } : null });

  function matches(item, query, type) {
    if (type && type !== "all" && item.type !== type) return false;
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    return `${item.title} ${item.description} ${item.preview || ""} ${(item.tools || []).join(" ")} ${item.author || ""}`.toLowerCase().includes(q);
  }

  async function fetchPage(source, { query, type, cursor, tools, tags, sort, collectionId }) {
    const ct = type && type !== "all" ? type : null;
    if (source === "feed_for_you" || source === "feed_following") { const p = await PApi.feed({ tab: source === "feed_for_you" ? "for_you" : "following", contentType: ct, limit: PAGE, cursor }); return { items: p.items.map((r) => fromPublic(r, "feed")), nextCursor: p.nextCursor || null }; }
    if (source === "collection") { const p = await PApi.collectionPrompts(collectionId, { limit: PAGE, cursor }); return { items: p.items.map((r) => fromPublic(r, "collection")), nextCursor: p.nextCursor || null }; }
    if (source === "mine") { const p = await PApi.myPrompts({ limit: PAGE, cursor }); return { items: p.items.map((r) => fromMe(r, "mine")), nextCursor: p.nextCursor || null }; }
    if (source === "drafts") { const p = await PApi.myPrompts({ status: "draft", limit: PAGE, cursor }); return { items: p.items.map((r) => fromMe(r, "drafts")), nextCursor: p.nextCursor || null }; }
    if (source === "saved") { const p = await PApi.mySaved({ limit: PAGE, cursor }); return { items: p.items.map((r) => fromMe(r, "saved")), nextCursor: p.nextCursor || null }; }
    if (source === "popular") { const p = await PApi.popular({ limit: PAGE, contentType: ct }); return { items: (p.items || []).map((r) => fromPublic(r, "popular")), nextCursor: null }; }
    const p = await PApi.search({ q: query, contentType: ct, limit: PAGE, cursor, sort, tools, tags });
    return { items: p.items.map((r) => fromPublic(r, "explore")), nextCursor: p.nextCursor || null };
  }

  // Bir kaynağın sayfasını verir. Benim/Kaydettiğim sorgu ve tür süzgecini istemcide uygular (API'de q yok); Keşfet/Popüler sunucuda.
  // Ağ yoksa ilk sayfa için son kaydedilen liste döner (`cached: true`).
  async function list(source, { query = "", type = "all", cursor = null, tools, tags, sort, collectionId } = {}) {
    if (source === "recent") {
      const recent = await PStore.get("recent");
      return { items: recent.filter((i) => matches(i, query, type)), nextCursor: null, cached: false };
    }
    if (!SOURCES.includes(source)) throw new PErr("bad_request", "source");
    try {
      const page = await fetchPage(source, { query, type, cursor, tools, tags, sort, collectionId });
      if (!cursor && (source === "mine" || source === "saved" || source === "drafts" || (source === "popular" && type === "all"))) {
        const libCache = await PStore.get("libCache");
        await PStore.set({ libCache: { ...libCache, [source]: { items: page.items, at: new Date().toISOString() } } });
      }
      const local = source === "mine" || source === "saved" || source === "drafts";
      return { items: local ? page.items.filter((i) => matches(i, query, type)) : page.items, nextCursor: page.nextCursor, cached: false, loadedCount: page.items.length };
    } catch (err) {
      if (err && err.code === "offline" && !cursor) {
        const libCache = await PStore.get("libCache");
        const hit = libCache[source];
        if (hit) return { items: hit.items.filter((i) => matches(i, query, type)), nextCursor: null, cached: true };
      }
      throw err;
    }
  }

  // Koleksiyonlarım (sahibi olduklarım + ortak olduklarım).
  async function collections() { const r = await PApi.collections(); return (r.items || []).map((c) => ({ id: c.id, name: c.name || "", promptCount: c.promptCount || 0, shared: Boolean(c.shared), mine: c.mine !== false, owner: c.ownerUsername || "" })); }

  // Tam metin + değişkenler. Önce bellek, sonra çevrimdışı önbellek yedeği.
  async function text(item) {
    if (memText.has(item.id)) return memText.get(item.id);
    try {
      let out;
      if (item.source === "mine" || item.source === "drafts" || (item.source === "recent" && item.own)) {
        const p = await PApi.myPrompt(item.id);
        out = { text: p.promptText || "", variables: (p.variables || []).map((n) => ({ name: typeof n === "string" ? n : n.name, defaultValue: (typeof n === "object" && n.defaultValue) || "" })) };
      } else {
        const p = await PApi.prompt(item.id);
        out = { text: p.promptText || "", variables: (p.variables || []).map((v) => ({ name: v.name, defaultValue: v.defaultValue || "" })) };
      }
      memText.set(item.id, out);
      const cache = await PStore.get("textCache");
      const next = { ...cache, [item.id]: { ...out, at: Date.now() } };
      const keys = Object.keys(next).sort((a, b) => next[b].at - next[a].at);
      for (const k of keys.slice(TEXT_CACHE_MAX)) delete next[k];
      await PStore.set({ textCache: next });
      return out;
    } catch (err) {
      if (err && (err.code === "offline" || err.code === "server")) {
        const hit = (await PStore.get("textCache"))[item.id];
        if (hit) return { text: hit.text, variables: hit.variables };
      }
      throw err;
    }
  }

  // Kullanılan prompt "son kullanılan" listesine girer (kimlik başına tek satır, en yeni üstte).
  async function markUsed(item) {
    const recent = await PStore.get("recent");
    const row = { id: item.id, title: item.title, type: item.type, source: "recent", own: item.source === "mine" || item.source === "drafts" || Boolean(item.own), url: item.url || "", author: item.author || "", description: item.description || "", tools: item.tools || [], at: new Date().toISOString() };
    await PStore.set({ recent: [row, ...recent.filter((r) => r.id !== item.id)].slice(0, RECENT_MAX) });
    return row;
  }

  return { PAGE, SOURCES, list, text, collections, markUsed, matches, _test: { fromMe, fromPublic } };
})();
