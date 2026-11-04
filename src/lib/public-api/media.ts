/**
 * Kişisel API / MCP ile taslağa görsel ekleme çekirdeği (docs/history/334-*). Bağımlılıksızdır: ağ, DNS ve Storage yazımı dışarıdan verilir
 * (`ImageSourceDeps`, `MediaStorage`), bu yüzden Node'da sahte bağımlılıklarla test edilir; Edge Function `media-upload` gerçeklerini bağlar.
 *
 * Akış (`attachImageToDraft`): (1) `api_me_media_begin` — kimlik, sahiplik, taslak, tür, ≤4 görsel, hız sınırı; (2) görsel indirilir (SSRF korumalı),
 * baytlardan BİÇİMİ ve BOYUTU okunur (istemcinin söylediği tür/uzantıya güvenilmez); (3) `prompt-media/{kullanıcı}/{uuid}.{uzantı}` yoluna yazılır;
 * (4) `api_me_media_commit` — dosya orada mı + satırı yazar. Commit başarısızsa yüklenen dosya silinmeye çalışılır (yoksa yetim süpürücü 1 saatte alır).
 *
 * SINIRLAR (bilerek): sunucuda yeniden boyutlandırma/yeniden kodlama YOK (Deno'da görüntü kütüphanesi yok) — büyük dosya küçültülmez, reddedilir; baskın
 * renk ve bulanık önizleme hesaplanmaz (moderatör aracı doldurur). DNS yeniden bağlama (TOCTOU) tam kapatılamaz: ad çözülüp denetlenir ama `fetch` adı
 * yeniden çözer — bu yüzden ek olarak yalnız https/443, yönlendirmeler tek tek denetlenir ve gövde boyutu sınırlıdır.
 */
import { PublicApiError } from "./rest.ts";
import { bearerOf, looksLikeCredential, type MeBackend, type MeTx } from "./me.ts";
import { isUuid } from "./prompts.ts";

export const MEDIA_LIMITS = {
  maxBytes: 8 * 1024 * 1024,
  maxDimension: 20000,
  maxRedirects: 3,
  fetchTimeoutMs: 15_000,
  maxUrlChars: 2048,
} as const;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export interface SniffedImage {
  type: ImageType;
  ext: "jpg" | "png" | "webp";
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n));

function sniffPng(b: Uint8Array): SniffedImage | null {
  if (b.length < 24 || u32be(b, 0) !== 0x89504e47 || u32be(b, 4) !== 0x0d0a1a0a || ascii(b, 12, 4) !== "IHDR") return null;
  return { type: "image/png", ext: "png", width: u32be(b, 16), height: u32be(b, 20) };
}

function sniffJpeg(b: Uint8Array): SniffedImage | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i += 1;
      marker = b[i + 1];
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return { type: "image/jpeg", ext: "jpg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
    i += 2 + length;
  }
  return null;
}

function sniffWebp(b: Uint8Array): SniffedImage | null {
  if (b.length < 30 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const kind = ascii(b, 12, 4);
  if (kind === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { type: "image/webp", ext: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (kind === "VP8L") {
    if (b[20] !== 0x2f) return null;
    return { type: "image/webp", ext: "webp", width: 1 + (b[21] | ((b[22] & 0x3f) << 8)), height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)) };
  }
  if (kind === "VP8X") return { type: "image/webp", ext: "webp", width: 1 + u24le(b, 24), height: 1 + u24le(b, 27) };
  return null;
}

/** Baytlardan görsel biçimini ve boyutunu okur (PNG · JPEG · WebP); tanınmayan/bozuk/aşırı büyük → null. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  const found = sniffPng(bytes) ?? sniffJpeg(bytes) ?? sniffWebp(bytes);
  if (!found) return null;
  const { width, height } = found;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) return null;
  if (width > MEDIA_LIMITS.maxDimension || height > MEDIA_LIMITS.maxDimension) return null;
  return found;
}

// ---------------------------------------------------------------------------------------------------------------------
// SSRF koruması
// ---------------------------------------------------------------------------------------------------------------------

/** Dotted IPv4 mi? */
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Adres genel internetten mi (özel, döngü, bağlantı-yerel, paylaşımlı, çok noktaya yayın, ayrılmış DEĞİL)? Çözülen A/AAAA değerleri için. */
export function isPublicIp(ip: string): boolean {
  const v4 = IPV4.exec(ip);
  if (v4) {
    const [a, b, c] = [Number(v4[1]), Number(v4[2]), Number(v4[3])];
    if ([a, b, c, Number(v4[4])].some((n) => n > 255)) return false;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
    if (a === 169 && b === 254) return false; // bağlantı-yerel (bulut meta verisi dahil)
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  const v6 = ip.toLowerCase();
  if (!v6.includes(":")) return false;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6);
  if (mapped) return isPublicIp(mapped[1]);
  if (v6 === "::" || v6 === "::1") return false;
  const first = parseInt(v6.split(":")[0] || "0", 16);
  if (Number.isNaN(first) || first === 0) return false; // "::2" gibi ayrılmış blok; NAT64 (64:ff9b::) yerel adresleri sarabilir
  if ((first & 0xfe00) === 0xfc00) return false; // ULA fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // bağlantı-yerel fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // çok noktaya yayın
  if (first === 0x2001 && v6.startsWith("2001:db8")) return false; // belgeleme
  return true;
}

/** Yalnız https, 443, kimlik bilgisi yok, IP kesmesi/yerel ad yok. Geçersizse fırlatır; geçerliyse URL nesnesini döner. */
export function assertFetchableImageUrl(raw: string): URL {
  const bad = (message: string) => new PublicApiError("bad_request", message);
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MEDIA_LIMITS.maxUrlChars) throw bad("image_url must be a https URL.");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad("image_url is not a valid URL.");
  }
  if (url.protocol !== "https:") throw bad("image_url must start with https://.");
  if (url.username || url.password) throw bad("image_url must not contain credentials.");
  if (url.port && url.port !== "443") throw bad("image_url must use the default https port.");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    throw bad("image_url must point to a public host.");
  }
  if (IPV4.test(host) || host.includes(":") || host.startsWith("[")) throw bad("image_url must use a host name, not an IP address.");
  return url;
}

export interface ImageSourceDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Ad → A/AAAA adresleri (Deno: `Deno.resolveDns`). Boş dizi = çözülemedi. */
  resolve: (host: string) => Promise<string[]>;
  userAgent?: string;
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new PublicApiError("unprocessable", `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`);
  if (!response.body) {
    const all = new Uint8Array(await response.arrayBuffer());
    if (all.length > maxBytes) throw new PublicApiError("unprocessable", `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`);
    return all;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new PublicApiError("unprocessable", `The image is larger than ${Math.round(maxBytes / 1048576)} MB.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Adresi indirir: her adımda (yönlendirmeler dahil) URL ve çözülen adresler denetlenir; gövde boyut sınırıyla okunur. */
export async function downloadImage(rawUrl: string, deps: ImageSourceDeps): Promise<Uint8Array> {
  let current = rawUrl;
  for (let hop = 0; hop <= MEDIA_LIMITS.maxRedirects; hop++) {
    const url = assertFetchableImageUrl(current);
    let addresses: string[];
    try {
      addresses = await deps.resolve(url.hostname);
    } catch {
      addresses = [];
    }
    if (addresses.length === 0) throw new PublicApiError("bad_request", "image_url host could not be resolved.");
    if (!addresses.every(isPublicIp)) throw new PublicApiError("bad_request", "image_url must point to a public host.");

    let response: Response;
    try {
      response = await deps.fetch(url.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "image/png,image/jpeg,image/webp,image/*;q=0.5", "User-Agent": deps.userAgent ?? "PromptlyImageFetch/1.0" },
        signal: AbortSignal.timeout(MEDIA_LIMITS.fetchTimeoutMs),
      });
    } catch {
      throw new PublicApiError("upstream", "Could not download the image from image_url.");
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new PublicApiError("upstream", "image_url redirected without a location.");
      try {
        current = new URL(location, url).toString();
      } catch {
        throw new PublicApiError("upstream", "image_url redirected to an invalid location.");
      }
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new PublicApiError("upstream", `image_url answered with status ${response.status}.`);
    }
    return await readCapped(response, MEDIA_LIMITS.maxBytes);
  }
  throw new PublicApiError("upstream", "image_url redirected too many times.");
}

// ---------------------------------------------------------------------------------------------------------------------
// Taslağa ekleme
// ---------------------------------------------------------------------------------------------------------------------

export interface MediaStorage {
  /** `prompt-media/<path>`'e yazar (üstüne yazmaz; var olan yol hata verir). */
  put(path: string, bytes: Uint8Array, contentType: ImageType): Promise<void>;
  remove(path: string): Promise<void>;
  /** Satırda saklanan kimlik adresi (`…/storage/v1/object/public/prompt-media/<path>`). */
  publicUrl(path: string): string;
}

export interface AttachImageInput {
  promptId: string;
  imageUrl: string;
  alt?: string | null;
}

export interface AttachImageResult {
  promptId: string;
  mediaId: string;
  position: number;
  imageCount: number;
  width: number;
  height: number;
  bytes: number;
  contentType: ImageType;
}

const DB_CODES: Record<string, { code: ConstructorParameters<typeof PublicApiError>[0]; message: string }> = {
  not_found: { code: "not_found", message: "No such draft in your account." },
  not_draft: { code: "conflict", message: "Images can only be added to an unpublished draft." },
  not_image_prompt: { code: "unprocessable", message: "Only prompts with content_type \"image\" can have images. Update the draft's contentType first." },
  too_many_images: { code: "unprocessable", message: "A prompt can have at most 4 images." },
  file_missing: { code: "upstream", message: "The uploaded file could not be found; try again." },
  already_attached: { code: "conflict", message: "This image is already attached." },
  invalid_path: { code: "upstream", message: "Could not store the image." },
  invalid_url: { code: "upstream", message: "Could not store the image." },
  invalid_size: { code: "unprocessable", message: "The image dimensions are not supported." },
  invalid_alt: { code: "bad_request", message: "alt is too long (max 300 characters)." },
};

function dbFailure(report: unknown): PublicApiError | null {
  const r = report as { ok?: boolean; code?: string } | null;
  if (r?.ok === true) return null;
  const mapped = r?.code ? DB_CODES[r.code] : undefined;
  return new PublicApiError(mapped?.code ?? "upstream", mapped?.message ?? "Could not attach the image.");
}

/** Kısa kimlik: crypto.randomUUID (Node 19+ ve Deno). */
const newId = (): string => crypto.randomUUID();

export interface AttachDeps extends ImageSourceDeps {
  backend: MeBackend;
  storage: MediaStorage;
  /** Test için kimlik üretimi. */
  newId?: () => string;
}

export async function attachImageToDraft(bearer: string, input: AttachImageInput, deps: AttachDeps): Promise<AttachImageResult> {
  if (!isUuid(input.promptId)) throw new PublicApiError("bad_request", "prompt_id must be a UUID.");
  assertFetchableImageUrl(input.imageUrl); // ağa çıkmadan ucuz ön kontrol
  const alt = input.alt?.trim() ? input.alt.trim().slice(0, 300) : null;

  // 1) Yetki/sahiplik/sınır — dosya indirilmeden önce (başkasının taslağına bant harcatmayız).
  const begun = await deps.backend.withUser(bearer, "write", async (tx: MeTx) => {
    const [row] = await tx("select public.api_me_media_begin($1::uuid) as r", [input.promptId]);
    const failure = dbFailure(row?.r);
    if (failure) throw failure;
    return row?.r as { userId: string };
  });
  const userId = String(begun.userId);

  // 2) İndir + doğrula (ağ; veritabanı işlemi açık DEĞİL).
  const bytes = await downloadImage(input.imageUrl, deps);
  const image = sniffImage(bytes);
  if (!image) throw new PublicApiError("unprocessable", "image_url is not a PNG, JPEG or WebP image (or its size is not supported).");

  // 3) Yaz.
  const path = `${userId}/${(deps.newId ?? newId)()}.${image.ext}`;
  try {
    await deps.storage.put(path, bytes, image.type);
  } catch {
    throw new PublicApiError("upstream", "Could not store the image.");
  }

  // 4) Satırı yaz; olmazsa dosyayı geri al.
  try {
    return await deps.backend.withUser(bearer, "write", async (tx: MeTx) => {
      const [row] = await tx("select public.api_me_media_commit($1::uuid, $2, $3, $4, $5, $6) as r", [
        input.promptId,
        path,
        deps.storage.publicUrl(path),
        image.width,
        image.height,
        alt,
      ]);
      const failure = dbFailure(row?.r);
      if (failure) throw failure;
      const r = row?.r as { mediaId: string; position: number; count: number };
      return {
        promptId: input.promptId,
        mediaId: String(r.mediaId),
        position: Number(r.position),
        imageCount: Number(r.count),
        width: image.width,
        height: image.height,
        bytes: bytes.length,
        contentType: image.type,
      };
    });
  } catch (error) {
    await deps.storage.remove(path).catch(() => undefined);
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// HTTP: Edge Function `media-upload` (POST) ve onu çağıran istemci (MCP aracı)
// ---------------------------------------------------------------------------------------------------------------------

const STATUS: Record<PublicApiError["code"], number> = { bad_request: 400, not_found: 404, upstream: 502, timeout: 504, not_configured: 500, unauthorized: 401, insufficient_scope: 403, rate_limited: 429, conflict: 409, unprocessable: 422 };
const MAX_REQUEST_BYTES = 8 * 1024;

function reply(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

export interface MediaUploadHandlerOptions extends AttachDeps {
  onError?: (error: unknown) => void;
}

/** `POST` gövdesi `{ prompt_id, image_url, alt? }`; kimlik `Authorization: Bearer pmt_…`. Hata gövdesi `{ error: { code, message } }`. */
export function createMediaUploadHandler(options: MediaUploadHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") return reply({ error: { code: "method_not_allowed", message: "Use POST." } }, 405);
    const bearer = bearerOf(request.headers);
    if (!bearer || !looksLikeCredential(bearer)) return reply({ error: { code: "unauthorized", message: "Send a Promptly API key as `Authorization: Bearer …`." } }, 401);
    let text: string;
    try {
      text = await request.text();
    } catch {
      return reply({ error: { code: "bad_request", message: "Could not read the request body." } }, 400);
    }
    if (new TextEncoder().encode(text).length > MAX_REQUEST_BYTES) return reply({ error: { code: "bad_request", message: "Request body is too large." } }, 400);
    let body: { prompt_id?: unknown; image_url?: unknown; alt?: unknown };
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      return reply({ error: { code: "bad_request", message: "Body must be JSON: { prompt_id, image_url, alt? }." } }, 400);
    }
    if (typeof body?.prompt_id !== "string" || typeof body?.image_url !== "string" || (body.alt !== undefined && body.alt !== null && typeof body.alt !== "string")) {
      return reply({ error: { code: "bad_request", message: "Body must be JSON: { prompt_id, image_url, alt? }." } }, 400);
    }
    try {
      const result = await attachImageToDraft(bearer, { promptId: body.prompt_id, imageUrl: body.image_url, alt: (body.alt as string | null | undefined) ?? null }, options);
      return reply(result, 200);
    } catch (error) {
      if (error instanceof PublicApiError) return reply({ error: { code: error.code, message: error.message } }, STATUS[error.code]);
      options.onError?.(error);
      return reply({ error: { code: "upstream", message: "Could not attach the image." } }, 502);
    }
  };
}

/** `media-upload` işlevini çağıran istemci (MCP `attach_image` aracı bunu kullanır; `mcp`/`api` işlevlerinde service role OLMADIĞI için yükleme ayrı işlevdedir). */
export function createMediaUploadClient(options: { url: string; fetch?: typeof fetch; timeoutMs?: number }): (bearer: string, input: AttachImageInput) => Promise<AttachImageResult> {
  const doFetch = options.fetch ?? fetch;
  return async (bearer, input) => {
    let response: Response;
    try {
      response = await doFetch(options.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}` },
        body: JSON.stringify({ prompt_id: input.promptId, image_url: input.imageUrl, alt: input.alt ?? null }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 45_000),
      });
    } catch {
      throw new PublicApiError("upstream", "The image service did not answer.");
    }
    const payload = (await response.json().catch(() => null)) as (AttachImageResult & { error?: { code?: string; message?: string } }) | null;
    if (!response.ok || !payload || payload.error) {
      const code = payload?.error?.code as PublicApiError["code"] | undefined;
      throw new PublicApiError(code && code in STATUS ? code : "upstream", payload?.error?.message ?? "Could not attach the image.");
    }
    return payload;
  };
}
