/**
 * Açık API ve MCP için IP başına hız sınırı (docs/history/302-*). Bağımlılıksız ve saf: zamanı çağıran verebilir, bu yüzden birim testlidir.
 *
 * NE DEĞİLDİR: bir güvenlik duvarı değil, ADİL KULLANIM FRENİDİR. İki sebepten:
 *  - Sayaç Edge Function örneğinin (isolate) BELLEĞİNDEDİR; çok örnek ayağa kalkarsa toplam izin verilen sayı artar ve örnek yeniden başlayınca sayaç sıfırlanır.
 *    Veritabanında sayaç tutmak her istek için ek yazma demekti ve anon'un çağırabileceği bir sayaç ucu açardı; bilerek yapılmadı.
 *  - Anon anahtar sitenin JS paketinde açıktır: herkes bu işlevi atlayıp Supabase'in `/rest/v1` ucuna doğrudan gidebilir. Bu sınır yalnız API/MCP kapısını korur.
 *
 * Kimlik: `cf-connecting-ip` (Cloudflare ekler, istemci değiştiremez); yoksa `x-forwarded-for`'un İLK adresi; hiçbiri yoksa sınır UYGULANMAZ (herkesi tek
 * kovaya koyup hepsini kilitlemek, bir sızdırmadan daha kötüdür). IPv6 /64 önekine indirilir (bir ev/sunucu o blokta binlerce adres alır).
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
  check(key: string): RateLimitResult;
  readonly size: number;
}

/**
 * API: doğrudan geliştirici kullanımı. MCP: claude.ai / ChatGPT gibi bağlayıcılar isteği KULLANICININ değil şirketin sunucularından atar
 * (aynı IP binlerce kişiyi taşır), bu yüzden MCP sınırı bilerek daha geniştir.
 */
export const PUBLIC_API_RATE_LIMIT = { limit: 60, windowMs: 60_000 } as const;
export const PUBLIC_MCP_RATE_LIMIT = { limit: 300, windowMs: 60_000 } as const;

export function createRateLimiter(config: RateLimitConfig): RateLimiter {
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
    check(key) {
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

/** İsteği sayar. Kimlik belirlenemezse (ya da sınırlayıcı yoksa) null: sınır yok. */
export function checkRequest(limiter: RateLimiter | undefined, request: Request): RateLimitResult | null {
  if (!limiter) return null;
  const key = clientKeyOf(request.headers);
  return key ? limiter.check(key) : null;
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
