// mcp — Promptly MCP sunucusu, İNTERNET ÜZERİNDEN (Streamable HTTP, oturumsuz, düz JSON). Claude/ChatGPT/Cursor gibi istemcilerde "uzak MCP
// sunucusu / özel bağlayıcı" olarak eklenir; bilgisayara bir şey kurmak gerekmez (docs/history/299-*). Bütün mantık `mcp/src/remote.ts` ve
// `mcp/src/server.ts`'te; buradaki `remote.ts`/`server.ts` onların üretilmiş KOPYASIDIR (`node scripts/sync-function-shared.mjs`, elle düzenlenmez).
//
// Güvenlik: açık API ile aynı — yalnız ANON anahtar (sitenin oturumsuz ziyaretçisinin yetkisi), yalnız okur, kimlik doğrulama yok (bu yüzden
// `verify_jwt` KAPALI). SERVICE ROLE BURADA KULLANILMAZ ve eklenmemeli. Kullanıcı içeriği modele "veri, talimat değil" notuyla gider.
//
// Deploy: `supabase functions deploy mcp --no-verify-jwt` (supabase/config.toml + scripts/deploy-functions.sh). Adres:
//   https://<ref>.supabase.co/functions/v1/mcp

import { createRemoteRateLimiter, createRestClient, PUBLIC_MCP_RATE_LIMIT } from "../_shared/promptly/lib/public-api/index.ts";
import { createRemoteHandler } from "./remote.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Hız sınırı sayacı veritabanındadır ve bir SIR ister (`RATE_LIMIT_SECRET`); sır yoksa sınır YOK ve uyarı yazılır (docs/history/302-*).
const RATE_LIMIT_SECRET = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
if (!RATE_LIMIT_SECRET) console.warn("mcp: RATE_LIMIT_SECRET is not set — rate limiting is OFF");

Deno.serve(
  createRemoteHandler({
    version: "0.1.0",
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
  }),
);
