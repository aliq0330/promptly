// Promptly Extension — yerel kuyruk ve kayıt geçmişi (yalnızca chrome.storage.local).
// Yazma işlemleri background.js'te tek bir sıra üzerinden yapılır (yarış olmasın).

const PromptlyQueue = (() => {
  const QUEUE_KEY = "queue";   // gönderilmeyi bekleyen yakalamalar
  const SAVED_KEY = "saved";   // taslağa kaydedilenler (son 10)
  const ERROR_KEY = "lastError";
  const MAX_SAVED = 10;

  const get = async (key, fallback) => (await chrome.storage.local.get(key))[key] ?? fallback;

  return {
    QUEUE_KEY, SAVED_KEY, ERROR_KEY,
    getQueue: () => get(QUEUE_KEY, []),
    setQueue: (queue) => chrome.storage.local.set({ [QUEUE_KEY]: queue }),
    getSaved: () => get(SAVED_KEY, []),
    async addSaved(entry) {
      const saved = await get(SAVED_KEY, []);
      await chrome.storage.local.set({ [SAVED_KEY]: [entry, ...saved].slice(0, MAX_SAVED) });
    },
    getError: () => get(ERROR_KEY, ""),
    setError: (msg) =>
      msg ? chrome.storage.local.set({ [ERROR_KEY]: msg }) : chrome.storage.local.remove(ERROR_KEY),
    guessTitle(text) {
      const first = text.split("\n").find((l) => l.trim()) || "";
      const s = first.trim();
      return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    },
  };
})();
