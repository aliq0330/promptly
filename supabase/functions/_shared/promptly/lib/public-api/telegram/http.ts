/**
 * Telegram botunun HTTP katmanı — `Request → Response` (Edge Function `telegram` yalnız bunu `Deno.serve`'e verir; testler doğrudan çağırır).
 *
 *   POST …/telegram          Telegram webhook'u. `X-Telegram-Bot-Api-Secret-Token` başlığı `TELEGRAM_WEBHOOK_SECRET` ile eşleşmezse 401 (webhook'u kaydederken
 *                            `secret_token` olarak verilir; yalnız Telegram bilir). Doğrulanan her istek 200 döner — işlem hatası Telegram'ı yeniden yağdırmasın.
 *   POST …/telegram/notify   Zamanlayıcı (GitHub Actions). `X-Cron-Secret` = `TELEGRAM_CRON_SECRET`.
 *   POST …/telegram/setup    Tek seferlik kurulum (setWebhook + komut listesi). Aynı sır.
 *
 * Sırlar YOKSA uç kapalıdır (503, açık kapı değil). Sırlar sabit zamanlı karşılaştırılır; hiçbir yanıt/log belirteç ya da sır içermez.
 */
import { sha256Hex } from "../rate-limit.ts";
import type { TelegramBot } from "./bot.ts";
import type { NotifyReport, TelegramApi, TelegramUpdate } from "./types.ts";

const MAX_BODY_BYTES = 256 * 1024;

/** Sabit zamanlı eşitlik (uzunluk sızmasın diye önce özetlenir). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export interface TelegramHttpOptions {
  bot: TelegramBot;
  webhookSecret: string;
  cronSecret: string;
  notify: () => Promise<NotifyReport>;
  setup: () => Promise<Record<string, unknown>>;
  onError?: (error: unknown) => void;
}

export function createTelegramHttpHandler(options: TelegramHttpOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method.toUpperCase();

    if (method === "GET") return json({ name: "Promptly Telegram bot", ok: true });
    if (method !== "POST") return json({ error: "method_not_allowed" }, 405);

    if (path.endsWith("/notify") || path.endsWith("/setup")) {
      if (!options.cronSecret) return json({ error: "not_configured" }, 503);
      if (!(await safeEqual(request.headers.get("x-cron-secret") ?? "", options.cronSecret))) return json({ error: "unauthorized" }, 401);
      try {
        return json({ ok: true, ...(path.endsWith("/notify") ? { report: await options.notify() } : { setup: await options.setup() }) });
      } catch (error) {
        options.onError?.(error);
        return json({ ok: false, error: "failed" }, 500);
      }
    }

    // Webhook
    if (!options.webhookSecret) return json({ error: "not_configured" }, 503);
    if (!(await safeEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", options.webhookSecret))) return json({ error: "unauthorized" }, 401);
    let update: TelegramUpdate;
    try {
      const text = await request.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json({ ok: true });
      update = JSON.parse(text) as TelegramUpdate;
    } catch {
      return json({ ok: true });
    }
    if (!update || typeof update !== "object" || typeof update.update_id !== "number") return json({ ok: true });
    try {
      await options.bot.handleUpdate(update);
    } catch (error) {
      options.onError?.(error);
    }
    return json({ ok: true });
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Kurulum: webhook + komut listesi (belirteç yalnız `api` bağdaştırıcısının içindedir)
// ---------------------------------------------------------------------------------------------------------------------

/** Telegram komut adları yalnız küçük harf/rakam/alt çizgi olabilir (Türkçe karakter yok → ASCII adlar). */
const COMMANDS = {
  tr: [
    ["ara", "Prompt ara"], ["populer", "Popüler promptlar"], ["prompt", "Bir promptu göster"], ["doldur", "Değişkenleri doldur"],
    ["istek", "Bir isteği göster"], ["hazirayar", "Bir hazır ayarı göster"], ["workflow", "Bir workflow'u göster"],
    ["baglan", "Promptly hesabını bağla"], ["benim", "Promptların"], ["taslak", "Özel taslak ekle"], ["duzenle", "Taslağı düzenle"],
    ["bildirim", "Bildirim tercihleri"], ["ayril", "Bağlantıyı kaldır"], ["yardim", "Tüm komutlar"],
  ],
  en: [
    ["search", "Search prompts"], ["popular", "Popular prompts"], ["prompt", "Show a prompt"], ["fill", "Fill the variables"],
    ["request", "Show a request"], ["preset", "Show a preset"], ["workflow", "Show a workflow"],
    ["link", "Link your Promptly account"], ["mine", "Your prompts"], ["draft", "Add a private draft"], ["edit", "Edit a draft"],
    ["notify", "Notification settings"], ["unlink", "Remove the link"], ["help", "All commands"],
  ],
} as const;

export async function runTelegramSetup(input: { api: TelegramApi; webhookUrl: string; webhookSecret: string }): Promise<Record<string, unknown>> {
  const hook = await input.api.call("setWebhook", {
    url: input.webhookUrl,
    secret_token: input.webhookSecret,
    allowed_updates: ["message", "callback_query", "inline_query"],
    max_connections: 20,
  });
  const toList = (pairs: readonly (readonly [string, string])[]) => pairs.map(([command, description]) => ({ command, description }));
  const fallback = await input.api.call("setMyCommands", { commands: toList(COMMANDS.en) });
  const tr = await input.api.call("setMyCommands", { commands: toList(COMMANDS.tr), language_code: "tr" });
  const describe = (result: { ok: boolean }) => (result.ok ? "ok" : "failed");
  return { webhook: describe(hook), commands: describe(fallback), commandsTr: describe(tr) };
}
