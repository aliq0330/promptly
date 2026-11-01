// api — Promptly açık API'si (salt-okunur, `docs/history/297-*`). Bütün mantık `src/lib/public-api` çekirdeğindedir; burası yalnız
// onu `Deno.serve`'e bağlar. Çekirdeğin buradaki kopyası `../_shared/promptly/` — `node scripts/sync-function-shared.mjs` üretir,
// elle düzenlenmez.
//
// Güvenlik: açık uçlar yalnız ANON anahtarla (Supabase'in otomatik verdiği `SUPABASE_ANON_KEY`) — sitenin oturumsuz ziyaretçisiyle aynı yetki, RLS
// her şeyi belirler. `/v1/me*` kullanıcının KENDİ kimliğiyle çalışır (anahtar/OAuth → işlemde rol + iddia). SERVICE ROLE BURADA KULLANILMAZ ve eklenmemeli.
//
// Deploy: `supabase functions deploy api --no-verify-jwt` (herkese açık okuma; `supabase/config.toml` + `scripts/deploy-functions.sh`).
// Adres: https://<ref>.supabase.co/functions/v1/api/v1  — belge: …/v1/openapi.json

import { createApiHandler } from "../_shared/promptly/lib/public-api/http.ts";
import { createRemoteRateLimiter, PUBLIC_API_RATE_LIMIT } from "../_shared/promptly/lib/public-api/rate-limit.ts";
import { createRestClient } from "../_shared/promptly/lib/public-api/rest.ts";
import { createRemotePromptUseRecorder } from "../_shared/promptly/lib/public-api/usage.ts";
import { createMeBackend } from "../_shared/promptly/lib/public-api/me.ts";
import { createJwtVerifier, createPostgresMeDb } from "../_shared/me-edge.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Hız sınırı sayacı veritabanındadır ve bir SIR ister (`RATE_LIMIT_SECRET` ortam değişkeni; özeti `public_api_rate_limit_config`'te). Sır yoksa sınır YOK ve
// bir uyarı yazılır — hız sınırı API'yi düşürmemeli. Bellek içi sayaç Edge'de çalışmıyor (docs/history/302-*).
const RATE_LIMIT_SECRET = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
if (!RATE_LIMIT_SECRET) console.warn("api: RATE_LIMIT_SECRET is not set — rate limiting is OFF");

// Tek prompt okunduğunda/doldurulduğunda sayılır (Yaratıcı panelinde "API / MCP", docs/history/304-*); AYNI sırla yazılır, sır yoksa sayılmaz.
const usageClient = RATE_LIMIT_SECRET && SUPABASE_URL ? createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, timeoutMs: 1500 }) : null;

// `/v1/me*` (kişisel API anahtarı / OAuth, docs/history/315-*): doğrudan Postgres bağlantısıyla, işlemde `set local role authenticated` + kullanıcı iddialarıyla
// çalışır — RLS/askı/hız sınırı kullanıcının kendisininkiyle aynıdır. Bağlantı dizesi yoksa bu uçlar 404'tür (açık API etkilenmez).
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const me = DB_URL && SUPABASE_URL ? createMeBackend({ db: createPostgresMeDb(DB_URL), verifyJwt: createJwtVerifier(SUPABASE_URL, ANON_KEY), siteUrl: "https://aliq0330.github.io/promptly" }) : undefined;

const handler = createApiHandler({
  me,
  config: { url: SUPABASE_URL, anonKey: ANON_KEY },
  publicBaseUrl: SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/api/v1` : undefined,
  onError: (error) => console.error("api", error),
  rateLimiter:
    RATE_LIMIT_SECRET && SUPABASE_URL
      ? createRemoteRateLimiter({
          client: createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, timeoutMs: 1500 }),
          secret: RATE_LIMIT_SECRET,
          scope: "api",
          ...PUBLIC_API_RATE_LIMIT,
          onError: (error) => console.error("api rate limit", error),
        })
      : undefined,
  usage: usageClient
    ? createRemotePromptUseRecorder({ client: usageClient, secret: RATE_LIMIT_SECRET, source: "api", onError: (error) => console.error("api usage", error) })
    : undefined,
});

Deno.serve(handler);
