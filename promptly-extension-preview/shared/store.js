// Promptly uzantısı (önizleme) — yerel depo. Her şey chrome.storage.local'da; ağ yok.
// Kütüphane ÖRNEK VERİDİR. Gerçek sürümde burası açık API'den (arama, kaydedilenler, popüler) gelir.
self.PStore = self.PStore || (() => {
  const SITE = "https://aliq0330.github.io/promptly/";
  const SEED = [
    { id: "p1", type: "image", source: "own", tool: "Midjourney", score: 92, votes: 24, tags: ["sinematik", "orman"],
      title: "Sisli sabah ormanı, sinematik ışık",
      text: "Sisli bir sabah ormanında yürüyen kırmızı pelerinli bir kız, sinematik ışık, {mekan} atmosferi, 35mm, düşük kontrast" },
    { id: "p2", type: "text", source: "own", tool: "ChatGPT", score: 88, votes: 17, tags: ["bülten"],
      title: "Haftalık bülten özeti",
      text: "Aşağıdaki notlardan {okur} için {ton} bir tonda, en fazla {uzunluk} kelimelik bir haftalık bülten özeti yaz.\n\nNotlar:\n{notlar}" },
    { id: "p3", type: "image", source: "saved", tool: "GPT Image", score: 81, votes: 31, tags: ["ürün", "stüdyo"],
      title: "Ürün fotoğrafı, stüdyo ışığı",
      text: "{ürün} için temiz beyaz fon üzerinde stüdyo ürün fotoğrafı, yumuşak gölge, {açı} açı, yüksek çözünürlük" },
    { id: "p4", type: "image", source: "popular", tool: "Midjourney", score: 95, votes: 212, tags: ["karakter", "fantastik"],
      title: "Orman perisi karakter tasarımı",
      text: "Işıldayan kanatlı bir orman perisi, {renk} tonlarında, detaylı kostüm, karakter tasarım sayfası, nötr fon" },
    { id: "p5", type: "text", source: "saved", tool: "Claude", score: 79, votes: 12, tags: ["toplantı"],
      title: "Toplantı notlarından aksiyon listesi",
      text: "Aşağıdaki toplantı notlarından sahibi ve tarihi olan aksiyonları madde madde çıkar. Belirsiz olanları ayrı listele.\n\n{notlar}" },
    { id: "p6", type: "audio", source: "own", tool: "Suno", score: null, votes: 0, tags: ["lofi"],
      title: "Sakin lo-fi çalışma müziği",
      text: "{tempo} BPM sakin lo-fi hip hop, yumuşak piyano, hafif vinil çıtırtısı, {ruh} bir ruh hali, sözsüz" },
    { id: "p7", type: "video", source: "popular", tool: "Sora", score: 90, votes: 148, tags: ["tanıtım", "ürün"],
      title: "15 saniyelik ürün tanıtım videosu",
      text: "{ürün} etrafında yavaş dönen kamera, {mekan} ortamında, sıcak ışık, 15 saniye, sinematik geçişler" },
    { id: "p8", type: "text", source: "own", tool: "ChatGPT", score: 85, votes: 9, tags: ["e-posta"],
      title: "E-posta yanıtı yazıcı",
      text: "Şu e-postaya {ton} bir yanıt yaz. Kısa tut, {istek} konusunu net belirt.\n\nE-posta:\n{eposta}" },
  ];
  const DEFAULTS = { library: SEED, drafts: [], pending: [], online: true, session: null, lastUsed: null, results: [] };
  const KEYS = Object.keys(DEFAULTS);

  async function getAll() {
    const got = await chrome.storage.local.get(KEYS);
    const out = {};
    for (const k of KEYS) out[k] = got[k] === undefined ? DEFAULTS[k] : got[k];
    return out;
  }
  const get = async (k) => (await getAll())[k];
  const set = (obj) => chrome.storage.local.set(obj);
  async function seed() {
    const got = await chrome.storage.local.get("library");
    if (!got.library) await set({ library: SEED });
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

  // {değişken} jetonları: aynı ad bir kez sayılır, sıra korunur.
  const VAR_RE = /\{([^{}\s][^{}]{0,38})\}/g;
  function variablesOf(text) {
    const seen = [];
    for (const m of String(text).matchAll(VAR_RE)) if (!seen.includes(m[1])) seen.push(m[1]);
    return seen;
  }
  function fill(text, values) {
    return String(text).replace(VAR_RE, (all, name) => (values && values[name] ? values[name] : all));
  }
  // Yakalamada "[konu]" ve "{{konu}}" kalıplarını {konu} yapar; yapılan değişikliklerin listesini döner.
  function autoVariables(text) {
    const made = [];
    const slug = (s) => s.trim().toLowerCase().replace(/\s+/g, "_");
    let out = String(text).replace(/\{\{\s*([^{}\s][^{}]{0,29}?)\s*\}\}/g, (a, n) => { const v = slug(n); made.push(v); return "{" + v + "}"; });
    out = out.replace(/\[([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü0-9 _-]{0,29})\]/g, (a, n) => { const v = slug(n); made.push(v); return "{" + v + "}"; });
    return { text: out, made: [...new Set(made)] };
  }
  function guessTool(host) {
    const h = (host || "").toLowerCase();
    if (h.includes("midjourney")) return "Midjourney";
    if (h.includes("chatgpt") || h.includes("openai")) return "ChatGPT";
    if (h.includes("claude")) return "Claude";
    if (h.includes("gemini")) return "Gemini";
    if (h.includes("suno")) return "Suno";
    return "";
  }
  function guessTitle(text) {
    const first = String(text).split("\n").find((l) => l.trim()) || "";
    const s = first.trim();
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }
  // Yakalamayı taslağa ya da (çevrimdışı/oturumsuz) bekleyenlere yazar.
  async function saveCapture(draft) {
    const { drafts, pending, online, session } = await getAll();
    const item = { ...draft, id: uid(), createdAt: new Date().toISOString() };
    const direct = online && session;
    if (direct) await set({ drafts: [item, ...drafts] });
    else await set({ pending: [item, ...pending] });
    return { id: item.id, queued: !direct };
  }
  async function undoCapture(id) {
    const { drafts, pending } = await getAll();
    await set({ drafts: drafts.filter((d) => d.id !== id), pending: pending.filter((d) => d.id !== id) });
  }
  async function flushPending() {
    const { drafts, pending, online, session } = await getAll();
    if (!online || !session || !pending.length) return 0;
    await set({ drafts: [...pending, ...drafts], pending: [] });
    return pending.length;
  }
  async function markUsed(id) {
    const { library } = await getAll();
    await set({ lastUsed: { id, at: new Date().toISOString(), vote: null } });
    return library.find((p) => p.id === id) || null;
  }
  async function vote(worked) {
    const { library, lastUsed } = await getAll();
    if (!lastUsed || lastUsed.vote !== null) return null;
    const lib = library.map((p) => {
      if (p.id !== lastUsed.id) return p;
      const votes = (p.votes || 0) + 1;
      const base = p.score == null ? 0 : p.score * (p.votes || 0);
      return { ...p, votes, score: Math.round((base + (worked ? 100 : 0)) / votes) };
    });
    await set({ library: lib, lastUsed: { ...lastUsed, vote: worked ? "yes" : "no" } });
    return lib.find((p) => p.id === lastUsed.id);
  }
  return { SITE, SEED, getAll, get, set, seed, uid, variablesOf, fill, autoVariables, guessTool, guessTitle, saveCapture, undoCapture, flushPending, markUsed, vote };
})();
