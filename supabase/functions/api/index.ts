// api — Promptly açık API'si (salt-okunur, `docs/history/297-*`). Bütün mantık `src/lib/public-api` çekirdeğindedir; burası yalnız
// onu `Deno.serve`'e bağlar. Çekirdeğin buradaki kopyası `../_shared/promptly/` — `node scripts/sync-function-shared.mjs` üretir,
// elle düzenlenmez.
//
// Güvenlik: yalnız ANON anahtar (Supabase'in otomatik verdiği `SUPABASE_ANON_KEY`) — sitenin oturumsuz ziyaretçisiyle aynı yetki, RLS
// her şeyi belirler. SERVICE ROLE BURADA KULLANILMAZ ve eklenmemeli: anahtarlı/yazan uçlar Faz 2'de kullanıcının KENDİ oturumuyla gelir.
//
// Deploy: `supabase functions deploy api --no-verify-jwt` (herkese açık okuma; `supabase/config.toml` + `scripts/deploy-functions.sh`).
// Adres: https://<ref>.supabase.co/functions/v1/api/v1  — belge: …/v1/openapi.json

import { createApiHandler } from "../_shared/promptly/lib/public-api/http.ts";
import { createRemoteRateLimiter, PUBLIC_API_RATE_LIMIT } from "../_shared/promptly/lib/public-api/rate-limit.ts";
import { createRestClient } from "../_shared/promptly/lib/public-api/rest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Hız sınırı sayacı veritabanındadır ve bir SIR ister (`RATE_LIMIT_SECRET` ortam değişkeni; özeti `public_api_rate_limit_config`'te). Sır yoksa sınır YOK ve
// bir uyarı yazılır — hız sınırı API'yi düşürmemeli. Bellek içi sayaç Edge'de çalışmıyor (docs/history/302-*).
const RATE_LIMIT_SECRET = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
if (!RATE_LIMIT_SECRET) console.warn("api: RATE_LIMIT_SECRET is not set — rate limiting is OFF");

const handler = createApiHandler({
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
});

Deno.serve(handler);
