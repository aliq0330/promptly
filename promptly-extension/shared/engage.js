// Promptly uzantısı — etkileşim durumu (beğeni/tepki, kaydet, koleksiyon, takip, "Çalıştı mı?"): TEK yerde önbellek + iyimser güncelleme.
// Veri sunucudadır (`/v1/me/engagement`, yazmalar `interact` kapsamıyla PUT/DELETE); burada yalnız önbellek, geri alma ve dinleyiciler var.
// Kart ve ayrıntı bölmesi aynı durumu okur: biri değiştirirse öteki de güncellenir. Hata olursa iyimser değişiklik geri alınır ve hata fırlar.
self.PEngage = (() => {
  const REACTIONS = ["love", "fire", "wow", "clap", "haha", "idea"];
  const EMOJI = { love: "❤️", fire: "🔥", wow: "😮", clap: "👏", haha: "😂", idea: "💡" };
  const BATCH = 30;
  const COLLECTIONS_TTL_MS = 60_000;
  const cache = new Map(); // kimlik → durum | null (okunamayan / herkese açık olmayan)
  const subs = new Set();
  let colCache = null;

  const notify = (id) => { for (const fn of subs) { try { fn(id); } catch { /* dinleyici hatası akışı bozmaz */ } } };
  const on = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  const get = (id) => cache.get(id) || null;
  const emojiOf = (key) => EMOJI[key] || EMOJI.love;
  function reset() { cache.clear(); colCache = null; }

  // Kimlikleri 30'arlı gruplarla ister; hata olursa durum bilinmiyor sayılır (eylem düğmesi çizilmez, yanlış durum gösterilmez).
  async function load(ids) {
    const want = [...new Set(ids)].filter((id) => id && !cache.has(id));
    for (let i = 0; i < want.length; i += BATCH) {
      const part = want.slice(i, i + BATCH);
      try {
        const r = await PApi.engagement(part);
        const items = (r && r.items) || {};
        for (const id of part) cache.set(id, items[id] || null);
      } catch { /* kart eylemsiz çizilir */ }
    }
  }

  // Ortak: iyimser uygula → sunucuya yaz → hata olursa eski duruma dön.
  async function optimistic(id, patch, write) {
    const before = cache.get(id);
    if (!before) throw new PErr("not_found", "unknown");
    cache.set(id, { ...before, ...patch(before) });
    notify(id);
    try { return await write(); } catch (err) { cache.set(id, before); notify(id); throw err; }
  }

  // reaction: tepki anahtarı ya da null (geri al).
  const react = (id, reaction) => optimistic(id, () => ({ reaction: reaction || null }), () => PApi.setReaction(id, reaction || null));
  const save = (id, on) => optimistic(id, (s) => ({ saved: Boolean(on), collectionIds: on ? s.collectionIds : [] }), () => PApi.setSaved(id, Boolean(on)));
  const inCollection = (id, collectionId, on) => optimistic(
    id,
    (s) => ({ saved: on ? true : s.saved, collectionIds: on ? [...new Set([...s.collectionIds, collectionId])] : s.collectionIds.filter((c) => c !== collectionId) }),
    () => PApi.setCollectionItem(collectionId, id, Boolean(on)),
  );
  // Yazarı takip: aynı yazarın önbellekteki bütün kartları birlikte güncellenir.
  async function follow(username, on) {
    const touched = [...cache.entries()].filter(([, s]) => s && s.authorUsername === username);
    const before = new Map(touched.map(([id, s]) => [id, s]));
    for (const [id, s] of touched) { cache.set(id, { ...s, followingAuthor: Boolean(on) }); notify(id); }
    try { return await PApi.setFollow(username, Boolean(on)); } catch (err) { for (const [id, s] of before) { cache.set(id, s); notify(id); } throw err; }
  }
  // "Çalıştı mı?": works true/false oy verir ya da değiştirir, null geri alır; sayılar sunucudan döner.
  async function works(id, value) {
    const s = cache.get(id);
    if (!s) throw new PErr("not_found", "unknown");
    const res = await PApi.setWorks(id, value);
    const w = (res && res.works) || {};
    cache.set(id, { ...s, works: { ...s.works, yes: w.yes ?? s.works.yes, no: w.no ?? s.works.no, myVote: typeof w.myVote === "boolean" ? w.myVote : null } });
    notify(id);
    return cache.get(id);
  }

  // Koleksiyonlarım (kısa süreli önbellek; yeni koleksiyon sitede oluşturulur).
  async function collections(force) {
    if (!force && colCache && Date.now() - colCache.at < COLLECTIONS_TTL_MS) return colCache.items;
    const items = await PLib.collections();
    colCache = { items, at: Date.now() };
    return items;
  }

  return { REACTIONS, EMOJI, emojiOf, on, get, load, reset, react, save, inCollection, follow, works, collections };
})();
