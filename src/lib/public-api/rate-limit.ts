/**
 * Açık API ve MCP için IP başına hız sınırı (docs/history/302-*). Bağımlılıksız: zamanı/ağı çağıran verebilir, bu yüzden birim testlidir.
 *
 * NE DEĞİLDİR: bir güvenlik duvarı değil, ADİL KULLANIM FRENİDİR. Anon anahtar sitenin JS paketinde açıktır: herkes bu işlevleri atlayıp Supabase'in
 * `/rest/v1` ucuna doğrudan gidebilir; bu sınır yalnız API/MCP kapısını korur.
 *
 * İKİ SAYAÇ:
 *  - `createRemoteRateLimiter` (ÜRETİM): sayaç VERİTABANINDADIR (`public_api_rate_hit`, sırla korunur). Bellek içi sayaç Edge Function'larda ÇALIŞMADI: canlıda
 *    120 ardışık istek hiç sınırlanmadı, çünkü Supabase her isteği çoğunlukla farklı bir örneğe düşürüyor. Sayaç hata verirse (ağ, sır yok, yavaş) istek İZİN
 *    VERİLİR: hız sınırı API'yi asla düşürmemeli.
 *  - `createMemoryRateLimiter`: tek süreçte (testler, kendi sunucunda `createApiHandler` çalıştıran biri) etkilidir; Edge Function'da ETKİSİZDİR.
 *
 * Kimlik: `cf-connecting-ip` (Cloudflare ekler, istemci değiştiremez); yoksa `x-forwarded-for`'un İLK adresi; hiçbiri yoksa sınır UYGULANMAZ (herkesi tek
 * kovaya koyup hepsini kilitlemek, bir sızdırmadan daha kötüdür). IPv6 /64 önekine indirilir. Veritabanına ham IP gitmez: kova = sha256(sır|işlev|IP).
 */

export interface RateLimitConfig {
  /** Pencere başına izin verilen istek. */
  limit: number;
  windowMs: number;
  /** Bellekte tutulan en çok kova (aşılırsa süresi dolanlar, sonra en eskiler atılır). */
  maxKeys?: number;
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Pencerenin bittiği an (ms, epoch). */
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  /** `null` = sayılamadı/sınır uygulanmıyor (izin ver). */
  check(key: string): Promise<RateLimitResult | null>;
}

/**
 * API: doğrudan geliştirici kullanımı. MCP: claude.ai / ChatGPT gibi bağlayıcılar isteği KULLANICININ değil şirketin sunucularından atar
 * (aynı IP binlerce kişiyi taşır), bu yüzden MCP sınırı bilerek daha geniştir.
 */
export const PUBLIC_API_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
export const PUBLIC_MCP_RATE_LIMIT = { limit: 300, windowMs: 60_000 } as const;

/** Tek süreçte etkili, bellek içi sayaç (Edge Function'da etkisiz — başlık yorumuna bak). */
export function createMemoryRateLimiter(config: RateLimitConfig): RateLimiter & { readonly size: number } {
  const { limit, windowMs, maxKeys = 5000, now = Date.now } = config;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  function prune(at: number) {
    for (const [key, bucket] of buckets) if (bucket.resetAt <= at) buckets.delete(key);
    // Hâlâ doluysa en eskiler (Map ekleme sırasını korur) atılır: sınırsız büyüyen bellek kötüye kullanım yolu olmasın.
    for (const key of buckets.keys()) {
      if (buckets.size < maxKeys) break; // yeni kovaya yer aç
      buckets.delete(key);
    }
  }

  return {
    get size() {
      return buckets.size;
    },
    async check(key) {
      const at = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= at) {
        if (buckets.size >= maxKeys) prune(at);
        bucket = { count: 0, resetAt: at + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= limit;
      return {
        allowed,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - at) / 1000)),
      };
    },
  };
}

/** IPv6'yı ilk 64 bite (4 öbek) indirger; IPv4 ve tanınmayan biçimler olduğu gibi kalır. */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase();
  if (!ip.includes(":")) return ip;
  if (ip.startsWith("::ffff:") && ip.includes(".")) return ip.slice("::ffff:".length); // IPv4'e eşlenmiş
  const [head, tail] = ip.split("::");
  const headGroups = head ? head.split(":") : [];
  const tailGroups = tail !== undefined && tail ? tail.split(":") : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  const groups = tail === undefined ? headGroups : [...headGroups, ...Array(Math.max(0, missing)).fill("0"), ...tailGroups];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return ip;
  return groups.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** İsteği yapanın kimliği (kova anahtarı) ya da null (belirlenemedi → sınır uygulanmaz). */
export function clientKeyOf(headers: Headers): string | null {
  const direct = headers.get("cf-connecting-ip");
  if (direct?.trim()) return normalizeIp(direct);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0];
  if (forwarded?.trim()) return normalizeIp(forwarded);
  return null;
}

/** İsteği sayar. Kimlik belirlenemezse, sınırlayıcı yoksa ya da sayaç hata verirse null: sınır yok. */
export async function checkRequest(limiter: RateLimiter | undefined, request: Request): Promise<RateLimitResult | null> {
  if (!limiter) return null;
  const key = clientKeyOf(request.headers);
  if (!key) return null;
  try {
    return await limiter.check(key);
  } catch {
    return null;
  }
}

/** Veritabanındaki sayacı çağıran en küçük istemci arayüzü (`RestClient`'ın `rpc`'si). */
export interface RateLimitRpc {
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
}

export interface RemoteRateLimiterConfig {
  /** Kısa zaman aşımlı bir istemci verin (`createRestClient({ timeoutMs: 1500 })`): sayaç yavaşsa istek beklememeli. */
  client: RateLimitRpc;
  /** Edge Function ortamındaki `RATE_LIMIT_SECRET`; veritabanında yalnız özeti vardır. */
  secret: string;
  /** Kovaları ayırır (`api` / `mcp`): aynı IP iki yüzeyde ayrı sayılır. */
  scope: string;
  limit: number;
  windowMs: number;
  /** Sayaç hata verince (izin verilir) günlüğe yazmak için. */
  onError?: (error: unknown) => void;
}

export async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto is not available");
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Üretim sayacı: IP başına sayaç veritabanındadır (`public_api_rate_hit`). Hata = izin ver (null). */
export function createRemoteRateLimiter(config: RemoteRateLimiterConfig): RateLimiter {
  const windowSeconds = Math.max(1, Math.round(config.windowMs / 1000));
  return {
    async check(key) {
      try {
        const bucket = (await sha256Hex(`${config.secret}|${config.scope}|${key}`)).slice(0, 32);
        const rows = await config.client.rpc<{ allowed: boolean; hits: number; retry_after: number }[]>("public_api_rate_hit", {
          p_secret: config.secret,
          p_bucket: bucket,
          p_limit: config.limit,
          p_window_seconds: windowSeconds,
        });
        const row = rows?.[0];
        if (!row || typeof row.allowed !== "boolean") return null;
        const retryAfterSeconds = Math.max(1, Math.round(Number(row.retry_after) || windowSeconds));
        return {
          allowed: row.allowed,
          limit: config.limit,
          remaining: Math.max(0, config.limit - (Number(row.hits) || 0)),
          resetAt: Date.now() + retryAfterSeconds * 1000,
          retryAfterSeconds,
        };
      } catch (error) {
        config.onError?.(error);
        return null;
      }
    },
  };
}

/** Yanıta `RateLimit-*` (IETF taslağı) ve — reddedildiyse — `Retry-After` başlıklarını ekler. */
export function withRateLimitHeaders(response: Response, result: RateLimitResult | null): Response {
  if (!result) return response;
  const headers = new Headers(response.headers);
  headers.set("RateLimit-Limit", String(result.limit));
  headers.set("RateLimit-Remaining", String(result.remaining));
  headers.set("RateLimit-Reset", String(result.retryAfterSeconds));
  if (!result.allowed) headers.set("Retry-After", String(result.retryAfterSeconds));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Tarayıcıdaki betiklerin bu başlıkları okuyabilmesi için CORS `Access-Control-Expose-Headers` değeri. */
export const RATE_LIMIT_EXPOSE_HEADERS = "Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset";
