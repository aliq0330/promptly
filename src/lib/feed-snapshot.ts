/**
 * Son görülen listenin cihazda saklanan kopyası (docs/history/465-*, "stale-while-revalidate"): Ana Sayfa (Sana özel, Takip Ettiklerin),
 * Keşfet ve hikâye şeridi açılışta önce bu kopyayı ANINDA gösterir, gerçek liste arkadan gelince yerini alır. Sunucu yavaşken ya da kısa bir
 * donma sırasında ekran boş kalmaz / "yüklenemedi" demez. Yalnız bir kolaylıktır: hiçbir karar buna dayanmaz, kopya yoksa liste eskisi gibi yüklenir.
 *   - Kişiye göre anahtarlı (`owner` = kullanıcı kimliği ya da `guest`): başka hesabın kopyası okunmaz; çıkışta `clearSnapshots` hepsini siler.
 *   - 24 saatten eski, sürümü farklı ya da bozuk kopya yok sayılır; bir kopya en çok ~350 KB, toplam en çok 24 kopya (en eskisi silinir).
 *   - `localStorage` engelli/dolu ise sessizce çalışmaz (gizli sekme, Safari kotası): okuma `null`, yazma hiçbir şey yapmaz.
 * İçerik zaten kişinin görebildiğidir; erişim adresleri değil yalnız depolama yolları saklanır (görseller yine imzalı adresle açılır).
 */
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const SNAPSHOT_MAX_CHARS = 350_000;
export const SNAPSHOT_MAX_ENTRIES = 24;
const PREFIX = `promptly-snap:v${SNAPSHOT_VERSION}:`;
const INDEX_KEY = `${PREFIX}index`;

export interface Snapshot<T> {
  data: T;
  savedAt: number;
}

interface Stored<T> {
  v: number;
  owner: string;
  savedAt: number;
  data: T;
}

export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

function defaultStorage(): SnapshotStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const ownerKey = (owner: string | null | undefined) => (owner ? owner : "guest");
const entryKey = (owner: string | null | undefined, key: string) => `${PREFIX}${ownerKey(owner)}:${key}`;

function readIndex(storage: SnapshotStorage): string[] {
  try {
    const parsed = JSON.parse(storage.getItem(INDEX_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string" && k.startsWith(PREFIX)) : [];
  } catch {
    return [];
  }
}

/** Kaydedilmiş kopya; yoksa, eskiyse, başka kişininse ya da bozuksa `null`. */
export function readSnapshot<T>(
  owner: string | null | undefined,
  key: string,
  options: { now?: number; storage?: SnapshotStorage | null; maxAgeMs?: number } = {},
): Snapshot<T> | null {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return null;
  try {
    const raw = storage.getItem(entryKey(owner, key));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored<T>;
    const now = options.now ?? Date.now();
    if (stored?.v !== SNAPSHOT_VERSION || stored.owner !== ownerKey(owner) || typeof stored.savedAt !== "number") return null;
    if (now - stored.savedAt > Math.min(options.maxAgeMs ?? SNAPSHOT_MAX_AGE_MS, SNAPSHOT_MAX_AGE_MS) || stored.savedAt > now + 60_000) return null;
    return { data: stored.data, savedAt: stored.savedAt };
  } catch {
    return null;
  }
}

/** Kopyayı yazar (en yeni en sonda); sınırı aşan en eski kopyalar silinir. Başarısızlık sessizdir. */
export function writeSnapshot<T>(owner: string | null | undefined, key: string, data: T, options: { now?: number; storage?: SnapshotStorage | null } = {}): boolean {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return false;
  try {
    const full = entryKey(owner, key);
    const text = JSON.stringify({ v: SNAPSHOT_VERSION, owner: ownerKey(owner), savedAt: options.now ?? Date.now(), data } satisfies Stored<T>);
    if (text.length > SNAPSHOT_MAX_CHARS) return false;
    const index = readIndex(storage).filter((k) => k !== full);
    index.push(full);
    while (index.length > SNAPSHOT_MAX_ENTRIES) {
      const oldest = index.shift();
      if (oldest) storage.removeItem(oldest);
    }
    try {
      storage.setItem(full, text);
    } catch {
      // Kota dolu: önce en eski yarıyı bırak, bir kez daha dene; yine olmazsa vazgeç.
      for (const old of index.splice(0, Math.ceil(index.length / 2))) if (old !== full) storage.removeItem(old);
      if (!index.includes(full)) index.push(full);
      storage.setItem(full, text);
    }
    storage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    return false;
  }
}

/** Bu cihazdaki BÜTÜN kopyaları siler (çıkış yapınca). */
export function clearSnapshots(storage: SnapshotStorage | null = defaultStorage()): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith("promptly-snap:")) keys.push(k);
    }
    for (const k of keys) storage.removeItem(k);
  } catch {
    /* depolama erişilemiyor */
  }
}
