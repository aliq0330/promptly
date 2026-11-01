// oauth — Promptly'nin kendi OAuth 2.1 yetkilendirme sunucusu (docs/history/317-*). Bütün HTTP mantığı `src/lib/public-api/oauth.ts` çekirdeğindedir (kopyası
// `../_shared/promptly/`; `node scripts/sync-function-shared.mjs` üretir, elle düzenlenmez); asıl kurallar veritabanındaki `_oauth_*` fonksiyonlarıdır.
//
// Neden ayrı bir sunucu: Supabase'in OAuth belirteci hesabın TAMAMI adına çalışan oturum JWT'sidir. Burada verilen belirteç `pmt_` kişisel anahtarıdır — yalnız `read`
// (+ isteğe bağlı `write` = özel taslak), 1 saat, iptal edilebilir. Bu yüzden dinamik istemci kaydı (DCR) güvenle açık.
//
// Güvenlik: kamuya açık istemci (secret yok) + PKCE S256; `redirect_uri` kayıtlıyla birebir; kullanıcı onayı sitedeki `/oauth/connect` sayfasındadır (oturumlu kullanıcı, RPC `oauth_decide`).
// `verify_jwt` KAPALI (istemciler Supabase JWT'si taşımaz). Veritabanına doğrudan Postgres bağlantısıyla (`SUPABASE_DB_URL`, sahip rol) gider; SERVICE ROLE KULLANILMAZ.
//
// Deploy: `supabase functions deploy oauth --no-verify-jwt`. Adres: https://<ref>.supabase.co/functions/v1/oauth
//   keşif: …/oauth/.well-known/oauth-authorization-server · kayıt: …/oauth/register · yetki: …/oauth/authorize · belirteç: …/oauth/token · iptal: …/oauth/revoke
import { createOauthHandler } from "../_shared/promptly/lib/public-api/oauth.ts";
import { createRemoteRateLimiter } from "../_shared/promptly/lib/public-api/rate-limit.ts";
import { createRestClient } from "../_shared/promptly/lib/public-api/rest.ts";
import { createPostgresOauthQuery } from "../_shared/me-edge.ts";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const SITE_URL = "https://aliq0330.github.io/promptly";

// Hız sınırı sayacı veritabanındadır ve bir SIR ister (`RATE_LIMIT_SECRET`, docs/history/302-*); sır yoksa sınır YOK ve uyarı yazılır.
const RATE_LIMIT_SECRET = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
if (!RATE_LIMIT_SECRET) console.warn("oauth: RATE_LIMIT_SECRET is not set — rate limiting is OFF");

const limiter = (scope: string, limit: number, windowMs: number) =>
  RATE_LIMIT_SECRET && SUPABASE_URL
    ? createRemoteRateLimiter({
        client: createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, timeoutMs: 1500 }),
        secret: RATE_LIMIT_SECRET,
        scope,
        limit,
        windowMs,
        onError: (error) => console.error(`${scope} rate limit`, error),
      })
    : undefined;

const handler =
  DB_URL && SUPABASE_URL
    ? createOauthHandler({
        query: createPostgresOauthQuery(DB_URL),
        issuer: `${SUPABASE_URL}/functions/v1/oauth`,
        siteUrl: SITE_URL,
        resources: [`${SUPABASE_URL}/functions/v1/mcp/me`],
        // Genel: IP başına dakikada 120. Kayıt: IP başına saatte 10 (herkes istemci kaydedebilir, tabloyu şişirmesin).
        rateLimiter: limiter("oauth", 120, 60_000),
        registerLimiter: limiter("oauth-register", 10, 3_600_000),
        onError: (error) => console.error("oauth", error),
      })
    : () => Promise.resolve(new Response(JSON.stringify({ error: "server_error", error_description: "Not configured." }), { status: 503, headers: { "Content-Type": "application/json" } }));

Deno.serve(handler);
