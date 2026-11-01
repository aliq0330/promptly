/**
 * GIPHY katmanı (docs/history/308-*): yorumlarda ve mesajlarda GIF. Promptly GIF DOSYASI SAKLAMAZ — yalnız GIPHY kimliğini (`id`) yazar,
 * adres her zaman burada üretilir (`giphyUrl`). Böylece veritabanına rastgele adres giremez, GIF'i kaldıran GIPHY'dir.
 *
 * API anahtarı `NEXT_PUBLIC_GIPHY_API_KEY` (statik export: tarayıcıya gömülür; GIPHY anahtarları zaten tarayıcı kullanımı için verilir,
 * alan adına bağlanabilir). Anahtar yoksa seçici "GIF servisi yapılandırılmadı" der, GIF düğmeleri hata vermez.
 * Kullanım koşulu: seçicide "Powered by GIPHY" ibaresi gösterilir.
 */

export interface GifItem {
  /** GIPHY kimliği — veritabanına yazılan TEK değer. */
  id: string;
  title: string;
  /** Seçicide gösterilen küçük sürüm. */
  previewUrl: string;
  /** Hareketsiz (ilk kare) küçük sürüm — "hareketi azalt" ayarında. */
  stillUrl: string;
  width: number;
  height: number;
}

/** GIPHY kimliği biçimi: veritabanındaki CHECK (`^[A-Za-z0-9_-]{4,64}$`) ile AYNI. */
const GIPHY_ID = /^[A-Za-z0-9_-]{4,64}$/;
/** Mesaj eklerinde GIF'i fotoğraftan ayıran yol öneki (`attachments[].path = "giphy:<kimlik>"`). */
export const GIF_PATH_PREFIX = "giphy:";

export function isGiphyId(value: unknown): value is string {
  return typeof value === "string" && GIPHY_ID.test(value);
}

export type GifRendition = "fixed" | "still" | "original";

/** Bir GIF'in gösterim adresi; kimlik biçime uymuyorsa null (yanlış biçimli satır asla bir adrese dönüşmez). */
export function giphyUrl(id: string, rendition: GifRendition = "fixed"): string | null {
  if (!isGiphyId(id)) return null;
  const file = rendition === "still" ? "200w_s.gif" : rendition === "original" ? "giphy.gif" : "200w.gif";
  return `https://media.giphy.com/media/${id}/${file}`;
}

/** Mesaj ekinin yolu → GIPHY kimliği (GIF değilse ya da kimlik bozuksa null). */
export function gifIdFromPath(path: string): string | null {
  if (!path.startsWith(GIF_PATH_PREFIX)) return null;
  const id = path.slice(GIF_PATH_PREFIX.length);
  return isGiphyId(id) ? id : null;
}

export function gifPath(id: string): string {
  return `${GIF_PATH_PREFIX}${id}`;
}

const API = "https://api.giphy.com/v1/gifs";
/** Topluluk içeriği: "g" çok kısıtlayıcı, "r" fazla serbest — sitenin genel kullanımına "pg" uyar. */
const RATING = "pg";
export const GIF_PAGE_SIZE = 24;

export function giphyApiKey(): string {
  return (process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "").trim();
}

export function isGiphyConfigured(): boolean {
  return giphyApiKey() !== "";
}

interface RawImage {
  url?: string;
  width?: string | number;
  height?: string | number;
}
interface RawGif {
  id?: string;
  title?: string;
  images?: Record<string, RawImage | undefined>;
}

const toInt = (value: string | number | undefined): number => {
  const n = typeof value === "string" ? Number.parseInt(value, 10) : (value ?? 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
};

/** API cevabındaki tek GIF'i güvenli biçime çevirir; kimliği/ölçüsü bozuksa null (liste sessizce o satırı atlar). */
export function parseGif(raw: RawGif): GifItem | null {
  if (!raw || !isGiphyId(raw.id)) return null;
  const images = raw.images ?? {};
  const fixed = images.fixed_width_small ?? images.fixed_width ?? images.downsized;
  const still = images.fixed_width_small_still ?? images.fixed_width_still ?? fixed;
  const width = toInt(fixed?.width);
  const height = toInt(fixed?.height);
  if (!fixed?.url || !still?.url || width < 1 || height < 1) return null;
  // Adresler yalnız GIPHY'nin kendi alan adından kabul edilir (cevap bozulsa da başka bir siteye istek gitmez).
  if (!isGiphyHost(fixed.url) || !isGiphyHost(still.url)) return null;
  return { id: raw.id, title: (raw.title ?? "").slice(0, 120), previewUrl: fixed.url, stillUrl: still.url, width, height };
}

export function isGiphyHost(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && (hostname === "giphy.com" || hostname.endsWith(".giphy.com"));
  } catch {
    return false;
  }
}

export interface GifPage {
  items: GifItem[];
  /** Sonraki sayfanın başlangıcı; null = bitti. */
  nextOffset: number | null;
}

/** Aynı kimlik bir sayfada iki kez gelebilir (GIPHY sayfalar arası kayabilir) — yinelenenleri atar. */
export function dedupeGifs(existing: GifItem[], incoming: GifItem[]): GifItem[] {
  const seen = new Set(existing.map((g) => g.id));
  const fresh: GifItem[] = [];
  for (const gif of incoming) {
    if (seen.has(gif.id)) continue;
    seen.add(gif.id);
    fresh.push(gif);
  }
  return fresh;
}

export class GiphyError extends Error {
  readonly code: "not_configured" | "rate_limited" | "failed";
  constructor(code: "not_configured" | "rate_limited" | "failed") {
    super(code);
    this.code = code;
  }
}

/** GIPHY'ye tek gerçek istek (önbelleksiz, iptalsiz — paylaşılan istek bir çağıranın vazgeçmesiyle düşmesin diye `fetchGifs` sarar). */
async function requestGifs(q: string, offset: number): Promise<GifPage> {
  const key = giphyApiKey();
  if (!key) throw new GiphyError("not_configured");
  const params = new URLSearchParams({ api_key: key, limit: String(GIF_PAGE_SIZE), offset: String(offset), rating: RATING });
  if (q) {
    params.set("q", q.slice(0, 100));
    params.set("lang", "tr");
  }
  let response: Response;
  try {
    response = await fetch(`${API}/${q ? "search" : "trending"}?${params.toString()}`);
  } catch {
    throw new GiphyError("failed");
  }
  if (response.status === 429) throw new GiphyError("rate_limited");
  if (!response.ok) throw new GiphyError("failed");
  const body = (await response.json().catch(() => null)) as { data?: RawGif[]; pagination?: { total_count?: number; count?: number; offset?: number } } | null;
  const items = (body?.data ?? []).map(parseGif).filter((gif): gif is GifItem => gif !== null);
  const received = body?.data?.length ?? 0;
  const total = body?.pagination?.total_count ?? 0;
  const next = offset + received;
  // GIPHY arama sayfalamasında 4999 sınırı vardır; sayfa boşsa ya da toplam aşıldıysa biter.
  return { items, nextOffset: received > 0 && next < total && next < 4999 ? next : null };
}

// --- önbellek (docs/history/309-*) ------------------------------------------------------------------------------------------------
// Anahtar başına istek sınırı vardır (beta anahtar: saatte 100, TÜM ziyaretçiler için ortak): aynı aramayı/sayfayı yeniden sormak sınırı boşuna yer.
// Başarılı sayfalar kısa süre bellekte tutulur, aynı anda gelen aynı istekler TEK isteğe iner; hata ASLA saklanmaz ("Tekrar dene" gerçekten dener).
// Süre kısadır: GIPHY'nin trend listesi gün içinde değişir ve içerik kaldırılmış GIF uzun süre görünmesin.

/** Bir sayfanın bellekte kalma süresi. */
export const GIF_CACHE_TTL_MS = 10 * 60 * 1000;
/** En çok bu kadar sayfa tutulur (en eski atılır). */
export const GIF_CACHE_MAX = 60;

const pageCache = new Map<string, { at: number; page: GifPage }>();
const inflight = new Map<string, Promise<GifPage>>();

/** Arama kutusundaki büyük/küçük harf ve baş/son boşluk farkı aynı aramadır. */
export const gifCacheKey = (query: string, offset: number): string => `${query.trim().slice(0, 100).toLowerCase()}|${offset}`;

export function clearGifCache(): void {
  pageCache.clear();
  inflight.clear();
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  const aborted = () => new DOMException("Aborted", "AbortError");
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

/**
 * Boş arama = trend; doluysa arama. Hata → `GiphyError` (seçici "Tekrar dene" gösterir). Sonuç önbelleğe alınır (yukarıdaki not);
 * `signal` yalnız BU çağıranı bırakır, paylaşılan istek tamamlanır ve sonraki çağıran önbellekten alır.
 */
export async function fetchGifs(query: string, offset = 0, signal?: AbortSignal): Promise<GifPage> {
  if (!giphyApiKey()) throw new GiphyError("not_configured");
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const q = query.trim();
  const key = gifCacheKey(q, offset);
  const hit = pageCache.get(key);
  if (hit && Date.now() - hit.at < GIF_CACHE_TTL_MS) return hit.page;
  if (hit) pageCache.delete(key);
  let pending = inflight.get(key);
  if (!pending) {
    pending = requestGifs(q, offset)
      .then((page) => {
        pageCache.set(key, { at: Date.now(), page });
        while (pageCache.size > GIF_CACHE_MAX) pageCache.delete(pageCache.keys().next().value as string);
        return page;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return abortable(pending, signal);
}

/** Seçicinin hızlı konu çipleri: görünen ad (çeviri anahtarı `gif.topic.<anahtar>`) aynı zamanda arama terimidir; `trend` boş arama = GIPHY trendleri. */
export const GIF_TOPICS = ["trend", "clap", "wow", "thanks", "lol", "love"] as const;
export type GifTopic = (typeof GIF_TOPICS)[number];

/**
 * GIF'leri yan yana `count` sütuna dağıtır: her GIF o ana kadarki en kısa sütuna girer. Sonuç yalnız önceki öğelere bağlıdır, yani listeye
 * öğe EKLENİNCE var olan GIF'ler sütun değiştirmez (sayfa yüklenince kayma olmaz).
 */
export function splitColumns(items: GifItem[], count = 2): GifItem[][] {
  const columns = Array.from({ length: count }, () => ({ items: [] as GifItem[], height: 0 }));
  for (const item of items) {
    const target = columns.reduce((shortest, column) => (column.height < shortest.height ? column : shortest));
    target.items.push(item);
    target.height += item.height / item.width;
  }
  return columns.map((column) => column.items);
}
