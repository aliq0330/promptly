// telegram — Promptly Telegram botu (docs/history/323-*). Bütün mantık `src/lib/public-api/telegram/` çekirdeğindedir (kopyası `../_shared/promptly/`;
// `node scripts/sync-function-shared.mjs` üretir, elle düzenlenmez). Burası yalnız ortam değişkenlerini bağlar.
//
// Adresler (…/functions/v1/telegram):
//   POST /            Telegram webhook'u — `X-Telegram-Bot-Api-Secret-Token` = TELEGRAM_WEBHOOK_SECRET olmadan 401.
//   POST /notify      zamanlayıcı (GitHub Actions) — `X-Cron-Secret` = TELEGRAM_CRON_SECRET.
//   POST /setup       tek seferlik kurulum (setWebhook + komut listesi) — aynı sır.
//
// SIRLAR (Supabase → Edge Functions → Secrets; DEPOYA YAZILMAZ): TELEGRAM_BOT_TOKEN (BotFather), TELEGRAM_WEBHOOK_SECRET (rastgele, A-Z a-z 0-9 _ -),
// TELEGRAM_CRON_SECRET (rastgele), TELEGRAM_BOT_USERNAME (@ olmadan; isteğe bağlı), RATE_LIMIT_SECRET (var). Eksik sır = uç KAPALI (503), açık kapı değil.
//
// `verify_jwt` KAPALI (Telegram JWT taşımaz). Veritabanına doğrudan Postgres bağlantısıyla (`SUPABASE_DB_URL`) gider; SERVICE ROLE KULLANILMAZ. Kişisel komutlar bağlı
// kullanıcı adına tek işlemde `set local role authenticated` ile çalışır (RLS/askı/hız sınırı kullanıcınınkiyle aynı).
//
// Deploy: `supabase functions deploy telegram --no-verify-jwt` (ya da "Deploy Edge Functions" iş akışı, function: telegram).
import { createMeBackend } from "../_shared/promptly/lib/public-api/me.ts";
import { createRemoteRateLimiter } from "../_shared/promptly/lib/public-api/rate-limit.ts";
import { createRestClient } from "../_shared/promptly/lib/public-api/rest.ts";
import { createTelegramBot, createTelegramHttpHandler, runTelegramNotifications, runTelegramSetup } from "../_shared/promptly/lib/public-api/telegram/index.ts";
import { createJwtVerifier, createPostgresMeDb, createPostgresOwnerQuery } from "../_shared/me-edge.ts";
import { createTelegramApi } from "../_shared/telegram-edge.ts";

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const DB_URL = Deno.env.get("SUPABASE_DB_URL") ?? "";
const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const CRON_SECRET = Deno.env.get("TELEGRAM_CRON_SECRET") ?? "";
const BOT_USERNAME = (Deno.env.get("TELEGRAM_BOT_USERNAME") ?? "").replace(/^@/, "") || undefined;
const SITE_URL = "https://aliq0330.github.io/promptly";

if (!TOKEN || !DB_URL || !SUPABASE_URL) {
  console.warn("telegram: TELEGRAM_BOT_TOKEN / SUPABASE_DB_URL / SUPABASE_URL missing — the endpoint is closed");
  Deno.serve(() => new Response(JSON.stringify({ error: "not_configured" }), { status: 503, headers: { "Content-Type": "application/json" } }));
} else {
  // Hız sınırı sayacı veritabanındadır ve bir SIR ister (`RATE_LIMIT_SECRET`, docs/history/302-*); sır yoksa sınır YOK ve uyarı yazılır.
  const RATE_LIMIT_SECRET = Deno.env.get("RATE_LIMIT_SECRET") ?? "";
  if (!RATE_LIMIT_SECRET) console.warn("telegram: RATE_LIMIT_SECRET is not set — rate limiting is OFF");
  const limiter = (scope: string, limit: number, windowMs: number) =>
    RATE_LIMIT_SECRET
      ? createRemoteRateLimiter({
          client: createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, timeoutMs: 1500 }),
          secret: RATE_LIMIT_SECRET,
          scope,
          limit,
          windowMs,
          onError: (error) => console.error(`${scope} rate limit`, error),
        })
      : undefined;

  const api = createTelegramApi(TOKEN);
  const owner = createPostgresOwnerQuery(DB_URL);
  const me = createMeBackend({ db: createPostgresMeDb(DB_URL), verifyJwt: createJwtVerifier(SUPABASE_URL, ANON_KEY), siteUrl: SITE_URL });
  const onError = (error: unknown) => console.error("telegram", error instanceof Error ? error.message : "error");

  const bot = createTelegramBot({
    api,
    client: createRestClient({ url: SUPABASE_URL, anonKey: ANON_KEY, siteUrl: SITE_URL }),
    me,
    owner,
    siteUrl: SITE_URL,
    botUsername: BOT_USERNAME,
    rateLimiter: limiter("telegram", 30, 60_000),
    linkRateLimiter: limiter("telegram-link", 8, 3_600_000),
    onError,
  });

  Deno.serve(
    createTelegramHttpHandler({
      bot,
      webhookSecret: WEBHOOK_SECRET,
      cronSecret: CRON_SECRET,
      notify: () => runTelegramNotifications({ api, owner, me, siteUrl: SITE_URL, onError }),
      setup: () => runTelegramSetup({ api, webhookUrl: `${SUPABASE_URL}/functions/v1/telegram`, webhookSecret: WEBHOOK_SECRET }),
      onError,
    }),
  );
}
