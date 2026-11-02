/**
 * Supabase oturumu için DAYANIKLI depolama (docs/history/320-*). supabase-js oturumu `localStorage`'a yazar; yazma başarısız olursa (Safari'de kota
 * dolu, depolama engelli…) kütüphane yenilenen belirteci KAYDEDEMEZ ve her istekte AYNI eski yenileme belirtecini yeniden gönderir: sunucu bir süre
 * 200 döner (yenilenmemiş "çocuk" belirteç), ardından hız sınırı (429) / "belirteç bulunamadı" ile oturum düşer — kullanıcı kendiliğinden çıkış yapar,
 * sayfayı yenileyince geri giremez. Canlıda görülen tam buydu: bir oturumda yalnız 2 yenileme belirteci satırı, ama saatte onlarca `/token` isteği.
 *
 * Davranış: yazma `localStorage`'a gider; başarısız olursa önce eski değer silinip bir kez daha denenir (aynı anahtarın eski boyutu serbest kalır), yine olmazsa
 * `sessionStorage`'a yazılır ve değer BELLEKTE de tutulur. Yazma başarısız olduğu sürece o anahtarın doğruluk kaynağı bellektir (eski `localStorage` değeri
 * bayat kalır); yeniden yüklemede iki depodaki değerden `expires_at`'i en yeni olan seçilir. Hata `onPersistFailure` ile bir kez bildirilir (ham değer ASLA verilmez).
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PersistFailure {
  key: string;
  /** Yakalanan hatanın adı (`QuotaExceededError`, `SecurityError`…). */
  error: string;
  /** Değerin nereye yazılabildiği: `session` = yalnız bu sekmenin deposu, `memory` = yalnız bellek (sayfa yenilenince kaybolur). */
  savedTo: "session" | "memory";
}

export interface ResilientStorageOptions {
  local?: StorageLike | null;
  session?: StorageLike | null;
  onPersistFailure?: (failure: PersistFailure) => void;
}

/** supabase-js'in `SupportedStorage` biçimi (eşzamanlı kullanım). */
export interface ResilientStorage extends StorageLike {
  /** Sınama/tanılama: bu anahtar şu an bellek önceliğinde mi (kalıcı yazma başarısız). */
  isMemoryAuthoritative(key: string): boolean;
}

const SESSION_PREFIX = "promptly-auth-fallback:";

function errorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : "Error";
}

function tryGet(store: StorageLike | null | undefined, key: string): string | null {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}

/** Yazar; başarılıysa `null`, değilse hata adı. */
function trySet(store: StorageLike | null | undefined, key: string, value: string): string | null {
  if (!store) return "NoStorage";
  try {
    store.setItem(key, value);
    return null;
  } catch (error) {
    return errorName(error);
  }
}

function tryRemove(store: StorageLike | null | undefined, key: string): void {
  try {
    store?.removeItem(key);
  } catch {
    /* depolama kapalı */
  }
}

function expiresAtOf(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { expires_at?: unknown } | null;
    return typeof parsed?.expires_at === "number" ? parsed.expires_at : null;
  } catch {
    return null;
  }
}

/** İki depodaki değerden en yenisini seçer (`expires_at` büyük olan); biri yoksa öteki; ölçüt yoksa ilki. */
export function pickNewestSession(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  const ea = expiresAtOf(a);
  const eb = expiresAtOf(b);
  if (ea !== null && eb !== null && eb > ea) return b;
  return a;
}

export function createResilientStorage(options: ResilientStorageOptions = {}): ResilientStorage {
  const { local = null, session = null, onPersistFailure } = options;
  const memory = new Map<string, string>();
  const memoryFirst = new Set<string>();
  const reported = new Set<string>();

  return {
    getItem(key) {
      if (memoryFirst.has(key)) return memory.get(key) ?? null;
      const persisted = tryGet(local, key);
      const fallback = tryGet(session, SESSION_PREFIX + key);
      const picked = pickNewestSession(persisted, fallback);
      return picked ?? memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      let failure = trySet(local, key, value);
      if (failure !== null && local) {
        // Aynı anahtarın eski (bayat) değeri yer tutuyor olabilir: sil, bir kez daha dene.
        tryRemove(local, key);
        failure = trySet(local, key, value);
      }
      if (failure === null) {
        memoryFirst.delete(key);
        tryRemove(session, SESSION_PREFIX + key);
        reported.delete(key);
        return;
      }
      const sessionFailure = trySet(session, SESSION_PREFIX + key, value);
      memoryFirst.add(key);
      if (!reported.has(key)) {
        reported.add(key);
        try {
          onPersistFailure?.({ key, error: failure, savedTo: sessionFailure === null ? "session" : "memory" });
        } catch {
          /* bildirim hatası oturumu bozmaz */
        }
      }
    },
    removeItem(key) {
      memory.delete(key);
      memoryFirst.delete(key);
      reported.delete(key);
      tryRemove(local, key);
      tryRemove(session, SESSION_PREFIX + key);
    },
    isMemoryAuthoritative(key) {
      return memoryFirst.has(key);
    },
  };
}

/**
 * Tanılama özeti (yalnız anahtar adları ve boyutlar, değer ASLA): "≈ 4,9 MB · en büyük: ad (1,2 MB), …". Aynı kaynak adresindeki (`aliq0330.github.io`)
 * başka sitelerin de aynı depoyu paylaştığını görmek için: kota Promptly'den değil komşu bir uygulamadan dolabilir.
 */
export function describeStorageUsage(store: StorageLike & { length: number; key(index: number): string | null }, top = 3): string {
  try {
    const sizes: { key: string; bytes: number }[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key === null) continue;
      const value = store.getItem(key) ?? "";
      sizes.push({ key, bytes: (key.length + value.length) * 2 });
    }
    const total = sizes.reduce((sum, item) => sum + item.bytes, 0);
    const largest = sizes
      .sort((x, y) => y.bytes - x.bytes)
      .slice(0, top)
      .map((item) => `${item.key.slice(0, 40)} (${formatBytes(item.bytes)})`)
      .join(", ");
    return `≈ ${formatBytes(total)}${largest ? ` · ${largest}` : ""}`;
  } catch {
    return "?";
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}
