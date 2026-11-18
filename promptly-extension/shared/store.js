// Promptly uzantısı — yerel depo (chrome.storage.local). Belirteçler ve kuyruk YALNIZ güvenilen bağlamlarda (arka plan, popup, yan panel)
// okunur: arka plan `setAccessLevel(TRUSTED_CONTEXTS)` ile sayfaya enjekte edilen betiklerin depoya erişimini kapatır.
self.PStore = self.PStore || (() => {
  const DEFAULTS = {
    auth: null,        // { clientId, redirectUri, accessToken, refreshToken, expiresAt, scopes, user }
    queue: [],         // gönderilmeyi bekleyen yakalamalar
    sent: [],          // gönderilenler (son 20)
    recent: [],        // son kullanılan promptlar (son 20)
    slashOrigins: [],  // "/ ile aç" izni verilen siteler
    lastError: null,   // { code, message, at }
    libCache: {},      // kaynak → { items, at } (ilk sayfa, çevrimdışı için)
    textCache: {},     // prompt kimliği → { text, variables, at } (en çok 40)
    platform: "chatgpt", // "Çalıştır" hedefi (shared/platforms.js)
    views: [],         // Görünümlerim: kayıtlı süzgeç setleri [{ id, name, tab, filters }] (yalnız bu cihazda)
    slots: [],         // sabit slotlar (en çok 5): { id, title, type, source, own, url, author, description }
    prefs: {},         // görünüm tercihleri: { density, shown } (shared/browse.js)
  };
  const KEYS = Object.keys(DEFAULTS);
  async function getAll() {
    const got = await chrome.storage.local.get(KEYS);
    const out = {};
    for (const k of KEYS) out[k] = got[k] === undefined ? DEFAULTS[k] : got[k];
    return out;
  }
  const get = async (k) => (await getAll())[k];
  const set = (obj) => chrome.storage.local.set(obj);
  const uid = () => (self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  return { DEFAULTS, KEYS, getAll, get, set, uid };
})();
