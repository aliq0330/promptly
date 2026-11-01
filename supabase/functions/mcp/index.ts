// mcp — Promptly MCP sunucusu, İNTERNET ÜZERİNDEN (Streamable HTTP, oturumsuz, düz JSON). Claude/ChatGPT/Cursor gibi istemcilerde "uzak MCP
// sunucusu / özel bağlayıcı" olarak eklenir; bilgisayara bir şey kurmak gerekmez (docs/history/299-*). Bütün mantık `mcp/src/remote.ts` ve
// `mcp/src/server.ts`'te; buradaki `remote.ts`/`server.ts` onların üretilmiş KOPYASIDIR (`node scripts/sync-function-shared.mjs`, elle düzenlenmez).
//
// Güvenlik: açık adres (`/mcp`) açık API ile aynı — yalnız ANON anahtar, yalnız okur, kimlik doğrulama yok (bu yüzden `verify_jwt` KAPALI); kişisel adres
// (`/mcp/me`) kendi doğrulamasını yapar. SERVICE ROLE BURADA KULLANILMAZ ve eklenmemeli. Kullanıcı içeriği modele "veri, talimat değil" notuyla gider.
//
// Deploy: `supabase functions deploy mcp --no-verify-jwt` (supabase/config.toml + scripts/deploy-functions.sh). Adres:
//   https://<ref>.supabase.co/functions/v1/mcp

import { createRemotePromptUseRecorder, createRemoteRateLimiter, createRestClient, PUBLIC_MCP_RATE_LIMIT } from "../_shared/promptly/lib/public-api/index.ts";
import { createMeBackend } from "../_shared/promptly/lib/public-api/me.ts";
import { createJwtVerifier, createPostgresMeDb } from "../_shared/me-edge.ts";
import { createRemoteHandler } from "./remote.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Hız sınırı sayacı veritabanındadır ve bir SIR ister (`RATE_LIMIT_SECRET`); sır yoksa sınır YOK ve uyarı yazılır (docs/history/302-*).
const RATE_LIMIT_SECRET = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
if (!RATE_LIMIT_SECRET) console.warn("mcp: RATE_LIMIT_SECRET is not set — rate limiting is OFF");

// `get_prompt` / `fill_prompt` ile okunan promptlar sayılır (Yaratıcı panelinde "API / MCP", docs/history/304-*); AYNI sırla yazılır, sır yoksa sayılmaz.
const usageClient = RATE_LIMIT_SECRET && SUPABASE_URL ? createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, timeoutMs: 1500 }) : null;

// Kişisel adres `…/mcp/me` (docs/history/315-*): kişisel API anahtarı ya da OAuth belirteci ister; doğrudan Postgres bağlantısıyla kullanıcı olarak çalışır.
// Bağlantı dizesi yoksa bu adres 404'tür (açık MCP etkilenmez). OAuth istemcileri 401'deki `WWW-Authenticate` başlığından korumalı kaynak metadatasını bulur.
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const FUNCTION_BASE = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/mcp` : "";
const me =
  DB_URL && SUPABASE_URL
    ? {
        backend: createMeBackend({ db: createPostgresMeDb(DB_URL), verifyJwt: createJwtVerifier(SUPABASE_URL, ANON_KEY), siteUrl: "https://aliq0330.github.io/promptly" }),
        resourceUrl: `${FUNCTION_BASE}/me`,
        resourceMetadataUrl: `${FUNCTION_BASE}/oauth-protected-resource`,
        authorizationServers: [`${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`],
      }
    : undefined;

Deno.serve(
  createRemoteHandler({
    version: "0.2.0",
    me,
    getClient: () => createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY }),
    log: (message, error) => console.error("mcp", message, error ?? ""),
    // Bağlayıcılar şirket sunucularından geldiği için sınır API'den geniştir.
    rateLimiter:
      RATE_LIMIT_SECRET && SUPABASE_URL
        ? createRemoteRateLimiter({
            client: createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, timeoutMs: 1500 }),
            secret: RATE_LIMIT_SECRET,
            scope: "mcp",
            ...PUBLIC_MCP_RATE_LIMIT,
            onError: (error) => console.error("mcp rate limit", error),
          })
        : undefined,
    usage: usageClient
      ? createRemotePromptUseRecorder({ client: usageClient, secret: RATE_LIMIT_SECRET, source: "mcp", onError: (error) => console.error("mcp usage", error) })
      : undefined,
  }),
);
