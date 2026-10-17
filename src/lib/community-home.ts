/**
 * Topluluklar ana sayfası (`/communities`) için SAF kurallar — ağ ve React yok, node testiyle sınanır (docs/history/185-*).
 * Sıralama/erişim kararları sunucudadır (`member_feed_page`, `discover_feed_page`, `recommend_communities`, `browse_communities`);
 * burada yalnız sekme çözümleme, öneri tekrar azaltma, görüldü kuyruğu ve tekrarsız birleştirme vardır.
 */

export type HomeTab = "posts" | "discover" | "managed" | "invites";

export const HOME_TABS: readonly HomeTab[] = ["posts", "discover", "managed", "invites"];

/** "Davet ve başvurular" alt bölümleri: bana gelen davetler · benim gönderdiğim başvurular · yönettiğim topluluklara gelen başvurular. */
export type InvitesSection = "invites" | "mine" | "incoming";

export const INVITES_SECTIONS: readonly InvitesSection[] = ["invites", "mine", "incoming"];

export function isInvitesSection(value: unknown): value is InvitesSection {
  return typeof value === "string" && (INVITES_SECTIONS as readonly string[]).includes(value);
}

/** `mine` bir sekme değil, Gönderiler'deki "Topluluklarım" bağlantısının açtığı liste görünümüdür (eski `?tab=mine` adresi çalışır). */
export type HomeView = HomeTab | "mine";

/**
 * Adres parametresinden görünüm. Oturumsuz ziyaretçi her zaman Keşfet'tedir. Eski adresler korunur: `requests` → Davet ve başvurular
 * (Başvurularım bölümü), `invites` → Davet ve başvurular. Yönetilen topluluğu olmayan kullanıcı `managed` isterse Gönderiler'e düşer.
 */
export function resolveHomeView(
  tabParam: string | null,
  state: { signedIn: boolean; managesAny: boolean },
): { view: HomeView; section: InvitesSection } {
  if (!state.signedIn) return { view: "discover", section: "invites" };
  switch (tabParam) {
    case "discover":
      return { view: "discover", section: "invites" };
    case "mine":
      return { view: "mine", section: "invites" };
    case "managed":
      return { view: state.managesAny ? "managed" : "posts", section: "invites" };
    case "invites":
      return { view: "invites", section: "invites" };
    case "requests":
      return { view: "invites", section: "mine" };
    default:
      return { view: "posts", section: "invites" };
  }
}

/** Sekme adresi: Gönderiler (varsayılan) sade adres; diğerleri `?tab=`; Davet ve başvurular bölümü `section=` ile. */
export function homeHref(view: HomeView, section?: InvitesSection): string {
  if (view === "posts") return "/communities";
  const base = `/communities?tab=${view}`;
  return view === "invites" && section && section !== "invites" ? `${base}&section=${section}` : base;
}

// ---------------------------------------------------------------------------------------------
// Öneri şeridi: tekrar azaltma (sunucu durumsuzdur; "daha önce gösterildi" bilgisi tarayıcıdadır)
// ---------------------------------------------------------------------------------------------

export const SUGGESTION_STRIP_SIZE = 10;
/** Sunucudan şeritten fazla aday istenir ki daha önce gösterilenler sona alınırken yeni adaylar öne çıkabilsin. */
export const SUGGESTION_CANDIDATE_POOL = 30;
export const SUGGESTION_REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const SUGGESTION_STORAGE_KEY = "promptly-community-suggestions-shown";

export type ShownMap = Record<string, number>;

/** Saklanan değeri güvenle ayrıştırır (bozuk/eksik → boş). */
export function parseShownMap(raw: string | null | undefined): ShownMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: ShownMap = {};
    for (const [id, at] of Object.entries(value as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Adayları (sunucu ilgi sırasıyla) şerit boyuna indirir: pencere içinde daha önce GÖSTERİLMİŞ olanlar sona alınır, kendi aralarında
 * ve yeniler kendi aralarında sunucu sırasını korur. Yeterli yeni aday yoksa eskiler dolguya girer (şerit boş kalmaz).
 */
export function reduceRepeatedSuggestions<T extends { id: string }>(
  candidates: readonly T[],
  shown: ShownMap,
  now: number,
  limit: number = SUGGESTION_STRIP_SIZE,
  windowMs: number = SUGGESTION_REPEAT_WINDOW_MS,
): T[] {
  const fresh: T[] = [];
  const repeated: T[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    const at = shown[candidate.id];
    (at !== undefined && now - at < windowMs ? repeated : fresh).push(candidate);
  }
  return [...fresh, ...repeated].slice(0, Math.max(0, limit));
}

/** Gösterilenleri kaydeder; pencere dışına çıkanları temizler (depolama büyümez). */
export function recordShownSuggestions(shown: ShownMap, ids: readonly string[], now: number, windowMs: number = SUGGESTION_REPEAT_WINDOW_MS): ShownMap {
  const next: ShownMap = {};
  for (const [id, at] of Object.entries(shown)) if (now - at < windowMs) next[id] = at;
  for (const id of ids) if (next[id] === undefined) next[id] = now;
  return next;
}

// ---------------------------------------------------------------------------------------------
// Görüldü kuyruğu (gönderi ekranda yeterince kaldı → toplu olarak sunucuya)
// ---------------------------------------------------------------------------------------------

/** Bir gönderi "görüldü" sayılması için ekranda (en az %60) kalması gereken süre. */
export const SEEN_DWELL_MS = 1200;
export const SEEN_VISIBLE_RATIO = 0.6;
/** Sunucu isteği başına en çok kimlik (`mark_community_posts_seen` en çok 50 alır). */
export const SEEN_BATCH_SIZE = 50;

/** Kuyruktan, daha önce gönderilmemiş en çok `max` kimliği alır; gönderilenlere ekler. Aynı kimlik ikinci kez gönderilmez. */
export function takeSeenBatch(pending: Set<string>, sent: Set<string>, max: number = SEEN_BATCH_SIZE): string[] {
  const batch: string[] = [];
  for (const id of pending) {
    if (batch.length >= max) break;
    if (!sent.has(id)) batch.push(id);
  }
  for (const id of batch) {
    pending.delete(id);
    sent.add(id);
  }
  // Zaten gönderilmiş olanlar kuyruktan düşer.
  for (const id of [...pending]) if (sent.has(id)) pending.delete(id);
  return batch;
}

// ---------------------------------------------------------------------------------------------
// Akış listesi
// ---------------------------------------------------------------------------------------------

/** Yeni sayfayı mevcut listeye KOPYASIZ ekler (aynı kimlik ikinci kez girmez; ilk sıra korunur). */
export function appendUnique<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const ids = new Set(existing.map((item) => item.id));
  const out = [...existing];
  for (const item of incoming) {
    if (ids.has(item.id)) continue;
    ids.add(item.id);
    out.push(item);
  }
  return out;
}

/** Sunucu kimlik sırasını koruyarak (RLS'in okutmadığı/silinmiş olanlar atlanır) yüklenen gönderileri dizer. */
export function orderByIds<T extends { id: string }>(ids: readonly string[], byId: ReadonlyMap<string, T>): T[] {
  const out: T[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) out.push(item);
  }
  return out;
}

export type DiscoverFeedSource = "member" | "followed" | "public";

export function isDiscoverFeedSource(value: unknown): value is DiscoverFeedSource {
  return value === "member" || value === "followed" || value === "public";
}
