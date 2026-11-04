/**
 * Çevrimiçi durum, son görülme ve gizlilik — saf kurallar (docs/history/329-*). React/Supabase'e bağlı değildir; birim testi `presence.test.ts`.
 *
 * İki katman:
 *   - CANLI: kişinin KENDİ private Realtime Presence kanalı `presence:<kullanıcı>:<anahtar>`. Kanal adını yalnız sunucu verir (`presence_lookup`),
 *     yalnız görmeye yetkili izleyiciye; anahtar kişi ayarını değiştirince döner.
 *   - SON GÖRÜLME: `presence_state.last_active_at`; "şu an aktif" = son nabız `PRESENCE_ACTIVE_WINDOW_MS`'ten yeni (SQL `_presence_active_window()`).
 * Bütün gizlilik kararları SUNUCUDADIR; buradaki hiçbir şey bir kişinin görünürlüğüne karar vermez, yalnız sunucunun verdiğini yorumlar.
 */

export type PresenceMode = "auto" | "invisible";
export type PresenceAudience = "everyone" | "following" | "mutual" | "nobody";

export const PRESENCE_MODES: readonly PresenceMode[] = ["auto", "invisible"];
export const PRESENCE_AUDIENCES: readonly PresenceAudience[] = ["everyone", "following", "mutual", "nobody"];

/** "Şu an aktif" penceresi — SQL `_presence_active_window()` ile AYNI olmalı. */
export const PRESENCE_ACTIVE_WINDOW_MS = 5 * 60_000;
/** Son görülme nabzı: cihaz başına en sık bu aralıkla (sunucu ayrıca kişi başına 60 sn'de bir yazar). 2–5 dk aralığında. */
export const PRESENCE_HEARTBEAT_MS = 150_000;
/** İzlenen kişilerin kanal adı + son görülmesi bu aralıkla toplu yenilenir (tek RPC; yalnız sekme görünürken ve izlenen biri varken). */
export const PRESENCE_REFRESH_MS = 120_000;
/** Sekme bu kadar gizli kalınca kendi kanalından çıkılır ve izleme kanalları kapatılır (görünür olunca geri). */
export const PRESENCE_HIDDEN_GRACE_MS = 60_000;
/** Bir sekmede aynı anda açık tutulan canlı izleme kanalı sınırı (Supabase Realtime'ın bağlantı başına kanal sınırının altında). Fazlası son
 *  görülme penceresiyle gösterilir. */
export const PRESENCE_MAX_LIVE_CHANNELS = 40;
/** Tek `presence_lookup` çağrısının kimlik sınırı (SQL ile aynı). */
export const PRESENCE_LOOKUP_BATCH = 200;
/** Telegram odak kaydının yenilenme aralığı (sunucuda 75 sn geçerli). */
export const PRESENCE_FOCUS_REFRESH_MS = 60_000;

export function isPresenceMode(value: unknown): value is PresenceMode {
  return value === "auto" || value === "invisible";
}

export function isPresenceAudience(value: unknown): value is PresenceAudience {
  return value === "everyone" || value === "following" || value === "mutual" || value === "nobody";
}

/** Kendi durumunu gizliyor mu? (Karşılıklılık: gizleyen başkalarınınkini de göremez — sunucu da aynısını uygular.) */
export function isSelfHidden(mode: PresenceMode, audience: PresenceAudience): boolean {
  return mode === "invisible" || audience === "nobody";
}

/** Kendi kanalında "buradayım" demeli mi? (Sunucu politikası: yalnız Otomatik + kitle "Hiç kimse" değil.) */
export function shouldTrackSelf(mode: PresenceMode, audience: PresenceAudience): boolean {
  return !isSelfHidden(mode, audience);
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const TOPIC_RE = new RegExp(`^presence:(${UUID}):([0-9a-f]{32})$`);

export function parsePresenceTopic(topic: string | null | undefined): { userId: string; key: string } | null {
  if (!topic) return null;
  const match = TOPIC_RE.exec(topic);
  return match ? { userId: match[1], key: match[2] } : null;
}

/**
 * Telegram akıllı bildirimi için "açık tuttuğum sayfa" anahtarı — SQL `_presence_focus_key(href)` ile AYNI: yol (sondaki / atılır) + varsa `id`.
 * `pathname` uygulama içi yoldur (basePath'siz, `usePathname()`), `search` `?…` kısmıdır.
 */
export function presenceFocusKey(pathname: string | null | undefined, search: string | null | undefined): string | null {
  const href = `${pathname ?? ""}${search ?? ""}`;
  const noHash = href.split("#")[0];
  const path = noHash.split("?")[0].replace(/\/+$/, "");
  const idMatch = /[?&]id=([^&#]+)/.exec(noHash);
  const key = path + (idMatch ? `?id=${idMatch[1]}` : "");
  return key === "" ? null : key;
}

/** Sunucunun bir kişi için verdiği bilgi + canlı kanalın durumu. */
export interface PresenceEntry {
  /** `presence_lookup` bu kişiyi döndürdü mü (görmeye yetkili mi)? false = hiçbir şey gösterilmez. */
  visible: boolean;
  /** Canlı kanal adı (yetkili ise). */
  topic: string | null;
  /** Son görülme (UTC ISO) ya da hiç yok. */
  lastSeenAt: string | null;
  /** Canlı kanal: true = kanalda en az bir oturumu var, false = kanal bağlı ama kimse yok, null = kanal yok/kopuk (son görülmeye düşülür). */
  live: boolean | null;
  /** Son başarılı sunucu okuması (ms). */
  fetchedAt: number;
}

export interface PresenceView {
  /** Bu kişi için durum gösterilebilir mi? (görmeye yetkili ve bilgi geldi) */
  visible: boolean;
  online: boolean;
  lastSeenAt: string | null;
}

export const UNKNOWN_PRESENCE: PresenceView = { visible: false, online: false, lastSeenAt: null };

export function isRecentlyActive(lastSeenAt: string | null, now: number): boolean {
  if (!lastSeenAt) return false;
  const t = Date.parse(lastSeenAt);
  return Number.isFinite(t) && now - t < PRESENCE_ACTIVE_WINDOW_MS && t - now < 60_000;
}

/**
 * Çevrimiçi kararı: canlı kanal bağlıysa o belirleyicidir (sekmeyi kapatan anında düşer); kanal yoksa/koptuysa son görülme penceresine düşülür.
 */
export function derivePresence(entry: PresenceEntry | undefined, now: number): PresenceView {
  if (!entry || !entry.visible) return UNKNOWN_PRESENCE;
  const online = entry.live === null ? isRecentlyActive(entry.lastSeenAt, now) : entry.live;
  return { visible: true, online, lastSeenAt: entry.lastSeenAt };
}

/**
 * Canlı kanal açılacak kişiler: yetkili + kanal adı olan, en son İSTENEN önce, en çok `max`. (Kapanan bileşenin kişisi listeden düşer.)
 */
export function selectLiveIds(
  watched: ReadonlyMap<string, { count: number; lastAt: number }>,
  entries: ReadonlyMap<string, PresenceEntry>,
  max: number = PRESENCE_MAX_LIVE_CHANNELS,
): string[] {
  return [...watched.entries()]
    .filter(([id, w]) => w.count > 0 && entries.get(id)?.visible === true && Boolean(entries.get(id)?.topic))
    .sort((a, b) => b[1].lastAt - a[1].lastAt || (a[0] < b[0] ? -1 : 1))
    .slice(0, Math.max(0, max))
    .map(([id]) => id);
}

/** Yenilenmesi gereken kimlikler: hiç okunmamış ya da `maxAgeMs`'ten eski. */
export function idsNeedingLookup(ids: Iterable<string>, entries: ReadonlyMap<string, PresenceEntry>, now: number, maxAgeMs: number): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const entry = entries.get(id);
    if (!entry || now - entry.fetchedAt >= maxAgeMs) out.push(id);
  }
  return out;
}

/** Listeyi çevrimiçiler önce olacak biçimde YENİDEN SIRALAR (kararlı: aynı grupta özgün sıra korunur). */
export function sortOnlineFirst<T>(items: readonly T[], getId: (item: T) => string | null | undefined, online: ReadonlySet<string>): T[] {
  if (online.size === 0) return items.slice();
  return items
    .map((item, index) => ({ item, index, on: online.has(getId(item) ?? "") }))
    .sort((a, b) => (a.on === b.on ? a.index - b.index : a.on ? -1 : 1))
    .map((x) => x.item);
}

/** Canlı kanal durumundan (Realtime `presenceState()`) "o kişinin en az bir oturumu var mı". Yalnız sahibi track edebildiği için anahtar = kişi. */
export function liveFromPresenceState(state: Record<string, unknown[] | undefined>, userId: string): boolean {
  const metas = state[userId];
  if (Array.isArray(metas) && metas.length > 0) return true;
  // Eski/başka anahtarla izlenmiş oturum (anahtar her istemcide userId'dir; yine de sahipten başkası track edemez).
  return Object.values(state).some((value) => Array.isArray(value) && value.length > 0);
}

/** Topluluk sayısı gösterimi: 0 → gösterilmez; 10 000 sınırı "9 999+" gibi değil "10B+" biçimini çağırana bırakır. */
export function presenceCountVisible(count: number | null | undefined): count is number {
  return typeof count === "number" && Number.isFinite(count) && count > 0;
}
