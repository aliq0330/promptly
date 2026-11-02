/**
 * Telegram botu (docs/history/323-*) — en küçük Telegram tipleri ve bağdaştırıcı arayüzleri. Bağımlılıksız (Node + Deno): ağ ve veritabanı
 * dışarıdan verilir, bu yüzden bütün bot mantığı sahte bağdaştırıcılarla birim testlidir.
 */
import type { MeBackend } from "../me.ts";
import type { RateLimiter } from "../rate-limit.ts";
import type { RestClient } from "../rest.ts";

export type Lang = "tr" | "en";

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  inline_query?: TelegramInlineQuery;
}

export type TelegramCallResult<T = unknown> = { ok: true; result: T } | { ok: false; errorCode: number; description: string };

/** Telegram Bot API çağrısı (Edge Function'da `fetch`; testte sahte). Belirteç yalnız bu bağdaştırıcının içindedir, hiçbir yere yazılmaz. */
export interface TelegramApi {
  call<T = unknown>(method: string, params: Record<string, unknown>): Promise<TelegramCallResult<T>>;
}

/** Sahip rolle tek bir SQL çağrısı (`_telegram_*` yardımcıları; istemci rollerine kapalıdır). */
export type TelegramQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface TelegramBotOptions {
  api: TelegramApi;
  /** Herkese açık okuma (anon anahtar). */
  client: RestClient;
  /** Bağlı kullanıcı adına çalışma (kişisel komutlar). Verilmezse hesap bağlama/kişisel komutlar kapalıdır. */
  me?: MeBackend;
  /** Bağlama ve bildirim tercihi için sahip-rol SQL. `me` ile birlikte verilir. */
  owner?: TelegramQuery;
  /** Site kökü (`https://aliq0330.github.io/promptly`). */
  siteUrl: string;
  /** Botun kullanıcı adı (`@` olmadan): `/ara@PromptlyBot` ekini ayıklar ve derin bağlantıyı kurar. */
  botUsername?: string;
  /** Telegram kullanıcısı başına genel hız sınırı. */
  rateLimiter?: RateLimiter;
  /** Bağlama kodu denemeleri için ayrı (daha sıkı) sınır. */
  linkRateLimiter?: RateLimiter;
  onError?: (error: unknown) => void;
}

export interface NotifyReport {
  links: number;
  activitySent: number;
  weeklySent: number;
  unlinked: number;
  failed: number;
}
