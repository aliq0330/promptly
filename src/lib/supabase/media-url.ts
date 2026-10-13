import { supabase } from "./client";
import { storagePathFromUrl } from "./storage-cleanup";

/**
 * Gönderi medyasının bulunduğu PRIVATE bucket'lar (`20260919760000_private_media_buckets.sql`).
 * Satırlarda saklanan URL `…/object/public/<bucket>/<yol>` biçiminde KALIR (kimlik
 * olarak) ama bu adres artık kimseye dosya vermez: gösterirken kısa ömürlü bir
 * signed URL'ye çevrilir. Okuma yetkisini Storage policy'si verir — dosyayı
 * gösteren satır çağıran için okunabilirse (herkese açık gönderi ya da kendi
 * gönderisi) imza alınır, aksi hâlde `null` döner.
 */
export const PROTECTED_MEDIA_BUCKETS = ["prompt-media", "request-references", "result-media"] as const;
export type ProtectedMediaBucket = (typeof PROTECTED_MEDIA_BUCKETS)[number];

/** Kısa ömür: gönderi private yapıldıktan sonra önceden alınmış bir imzanın geçerli kalabileceği azami süre. */
const SIGNED_URL_TTL_SECONDS = 10 * 60;
/** Süre dolmadan az önce önbellekteki imza kullanılmaz; yeniden alınır. */
const REFRESH_MARGIN_MS = 60 * 1000;
/** Aynı anda mount olan onlarca görselin istekleri tek `createSignedUrls` çağrısında toplanır. */
const BATCH_DELAY_MS = 8;

interface ParsedMediaUrl {
  bucket: ProtectedMediaBucket;
  path: string;
}

/** Korumalı bir bucket'ın depolanmış URL'sini (bucket, yol) çiftine ayırır; başka URL (data:, harici, avatar…) için `null`. */
export function parseProtectedMediaUrl(url: string | null | undefined): ParsedMediaUrl | null {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return null;
  for (const bucket of PROTECTED_MEDIA_BUCKETS) {
    const path = storagePathFromUrl(url, bucket);
    if (path) return { bucket, path };
  }
  return null;
}

export function isProtectedMediaUrl(url: string | null | undefined): boolean {
  return parseProtectedMediaUrl(url) !== null;
}

const cache = new Map<string, { signedUrl: string; expiresAt: number }>();

/** Önbellekte hâlâ taze bir imza varsa onu döner (ilk boyamada anında göstermek için); korumasız URL'yi olduğu gibi döner. */
export function getCachedMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isProtectedMediaUrl(url)) return url;
  const hit = cache.get(url);
  return hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now() ? hit.signedUrl : null;
}

interface QueuedRequest {
  parsed: ParsedMediaUrl;
  waiters: Array<(signedUrl: string | null) => void>;
}

let queue = new Map<string, QueuedRequest>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushQueue(): Promise<void> {
  const batch = queue;
  queue = new Map();
  flushTimer = null;

  const byBucket = new Map<ProtectedMediaBucket, Map<string, string[]>>();
  for (const [url, { parsed }] of batch) {
    const paths = byBucket.get(parsed.bucket) ?? new Map<string, string[]>();
    paths.set(parsed.path, [...(paths.get(parsed.path) ?? []), url]);
    byBucket.set(parsed.bucket, paths);
  }

  await Promise.all(
    Array.from(byBucket, async ([bucket, pathToUrls]) => {
      const signedByPath = new Map<string, string>();
      try {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrls(Array.from(pathToUrls.keys()), SIGNED_URL_TTL_SECONDS);
        if (error) console.error("createSignedUrls", bucket, error.message);
        for (const item of data ?? []) {
          if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
        }
      } catch (err) {
        console.error("createSignedUrls", bucket, err);
      }
      for (const [path, urls] of pathToUrls) {
        const signedUrl = signedByPath.get(path) ?? null;
        for (const url of urls) {
          if (signedUrl) cache.set(url, { signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
          for (const waiter of batch.get(url)?.waiters ?? []) waiter(signedUrl);
        }
      }
    }),
  );
}

/**
 * Depolanmış bir medya URL'sini gösterilebilir URL'ye çevirir. Korumasız URL'ler
 * (data:, harici, avatar) aynen döner; korumalı olanlar için taze önbellek
 * kullanılır, yoksa istekler toplu imzalanır. İmza alınamazsa (dosya yok ya da
 * çağıran okuyamıyor) `null`. `force`: önbelleği yok say (süresi dolmuş imza
 * hata verdiğinde yenilemek için).
 */
export function resolveMediaUrl(url: string | null | undefined, options: { force?: boolean } = {}): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const parsed = parseProtectedMediaUrl(url);
  if (!parsed) return Promise.resolve(url);
  if (!options.force) {
    const cached = getCachedMediaUrl(url);
    if (cached) return Promise.resolve(cached);
  }
  return new Promise((resolve) => {
    const queued = queue.get(url);
    if (queued) queued.waiters.push(resolve);
    else queue.set(url, { parsed, waiters: [resolve] });
    if (!flushTimer) flushTimer = setTimeout(() => void flushQueue(), BATCH_DELAY_MS);
  });
}

/** Birçok URL'yi birden çözer (React dışı kod için); çözülemeyenler sonuçta yer almaz. */
export async function resolveMediaUrls(urls: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(urls.filter((u): u is string => Boolean(u))));
  const resolved = await Promise.all(unique.map((u) => resolveMediaUrl(u)));
  const result = new Map<string, string>();
  unique.forEach((u, i) => {
    const signed = resolved[i];
    if (signed) result.set(u, signed);
  });
  return result;
}
