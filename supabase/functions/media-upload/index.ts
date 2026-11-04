// media-upload — kişisel API / MCP ile taslağa GÖRSEL ekler (docs/history/333-*). Mantığın tamamı `src/lib/public-api/media.ts` çekirdeğindedir; burası onu
// Deno'ya (DNS, fetch, Storage REST) bağlar. Çekirdeğin buradaki kopyası `../_shared/promptly/` — `node scripts/sync-function-shared.mjs` üretir.
//
// GÜVENLİK — BU FONKSİYON SERVICE ROLE KULLANIR ve bu yüzden KÜÇÜK TUTULUR (`api` ve `mcp` işlevlerinde service role ASLA yoktur; yükleme bu yüzden ayrı):
//  • Kimlik doğrulama `api`/`mcp` ile AYNI yoldur: kişisel anahtar (`pmt_…`, `write` kapsamı) tek işlemde kullanıcı rolüne geçirilir (createMeBackend);
//    `api_me_media_begin` sahipliği, taslak olmayı, `image` türünü ve ≤4 görseli, hız sınırıyla (saatte 20 deneme) denetler. Anahtarsız istek buraya kadar gelmez.
//  • Service role YALNIZ tek iş için kullanılır: `prompt-media/{kullanıcı}/{uuid}.{jpg|png|webp}` yoluna yazmak (ve commit başarısızsa onu silmek). Yol
//    sunucuda kurulur: kullanıcı kimliği veritabanından (begin) gelir, uzantı BAYTLARDAN okunan biçimden gelir; istemci yol/tür veremez.
//  • Görsel indirmesi SSRF korumalıdır (yalnız https/443, ad çözülür ve her adres genel olmalı, yönlendirmeler tek tek denetlenir, 8 MB sınırı, 15 sn).
//  • Satırı yazan `api_me_media_commit` kullanıcı rolüyle çalışır (RLS); dosyanın gerçekten yüklendiğini ve yolun kullanıcının klasöründe olduğunu doğrular.
//
// Deploy: `supabase functions deploy media-upload --no-verify-jwt` (supabase/config.toml + scripts/deploy-functions.sh). Adres:
//   https://<ref>.supabase.co/functions/v1/media-upload   (POST, JSON { prompt_id, image_url, alt? }, Authorization: Bearer pmt_…)

import { createMediaUploadHandler, type ImageType, type MediaStorage } from "../_shared/promptly/lib/public-api/media.ts";
import { createMeBackend } from "../_shared/promptly/lib/public-api/me.ts";
import { createJwtVerifier, createPostgresMeDb } from "../_shared/me-edge.ts";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const BUCKET = "prompt-media";

function storageHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { apikey: SERVICE_ROLE_KEY, ...extra };
  // Eski anahtar bir JWT'dir (`eyJ…`) ve Authorization'a konur; yeni gizli anahtar (`sb_secret_…`) değildir.
  if (SERVICE_ROLE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SERVICE_ROLE_KEY}`;
  return headers;
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

const storage: MediaStorage = {
  async put(path: string, bytes: Uint8Array, contentType: ImageType) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(path)}`, {
      method: "POST",
      headers: storageHeaders({ "Content-Type": contentType, "x-upsert": "false", "Cache-Control": "max-age=3600" }),
      body: bytes,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new Error(`storage ${response.status}`);
    }
    await response.body?.cancel().catch(() => undefined);
  },
  async remove(path: string) {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodePath(path)}`, { method: "DELETE", headers: storageHeaders(), signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel().catch(() => undefined);
  },
  publicUrl: (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodePath(path)}`,
};

async function resolve(host: string): Promise<string[]> {
  const [a, aaaa] = await Promise.all([Deno.resolveDns(host, "A").catch(() => [] as string[]), Deno.resolveDns(host, "AAAA").catch(() => [] as string[])]);
  return [...a, ...aaaa];
}

const configured = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && DB_URL);
if (!configured) console.warn("media-upload: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_DB_URL missing — the function is disabled");

const handler = configured
  ? createMediaUploadHandler({
      backend: createMeBackend({ db: createPostgresMeDb(DB_URL), verifyJwt: createJwtVerifier(SUPABASE_URL, ANON_KEY), siteUrl: "https://aliq0330.github.io/promptly" }),
      storage,
      fetch: (url, init) => fetch(url, init),
      resolve,
      userAgent: "PromptlyImageFetch/1.0 (+https://aliq0330.github.io/promptly)",
      onError: (error) => console.error("media-upload", error),
    })
  : () => Promise.resolve(new Response(JSON.stringify({ error: { code: "not_configured", message: "Image upload is not configured." } }), { status: 404, headers: { "Content-Type": "application/json" } }));

Deno.serve(handler);
