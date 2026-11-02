/**
 * Telegram bağlantısı — saf yardımcılar (docs/history/323-*). Ağ ve arayüzden bağımsız, `node --test` ile sınanır.
 */

export interface TelegramLinkRow {
  id: string;
  username: string | null;
  name: string | null;
  scopes: string[];
  notifyWeekly: boolean;
  notifyActivity: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export const TELEGRAM_LINK_LIMIT = 3;

const str = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

/** `list_my_telegram_links` satırı → arayüz satırı; kimliği/zamanı olmayan satır atılır (null). */
export function mapTelegramLinkRow(raw: Record<string, unknown>): TelegramLinkRow | null {
  const id = str(raw.id);
  const createdAt = str(raw.created_at);
  if (!id || !createdAt) return null;
  return {
    id,
    username: str(raw.telegram_username),
    name: str(raw.telegram_name),
    scopes: Array.isArray(raw.scopes) ? raw.scopes.filter((scope): scope is string => scope === "read" || scope === "write") : [],
    notifyWeekly: raw.notify_weekly === true,
    notifyActivity: raw.notify_activity === true,
    createdAt,
    lastUsedAt: str(raw.last_used_at),
  };
}

/** Kodu okunur gösterir: `ABCD2345` → `ABCD-2345`. */
export function formatLinkCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Botu açan derin bağlantı (`/start link_KOD`); kullanıcı adı yoksa null. Kullanıcı adı yalnız güvenli karakterlerle kabul edilir. */
export function telegramDeepLink(botUsername: string | undefined | null, code: string): string | null {
  const bot = (botUsername ?? "").replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{3,32}$/.test(bot) || !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return null;
  return `https://t.me/${bot}?start=link_${code}`;
}

export function telegramBotHandle(botUsername: string | undefined | null): string | null {
  const bot = (botUsername ?? "").replace(/^@/, "");
  return /^[A-Za-z0-9_]{3,32}$/.test(bot) ? `@${bot}` : null;
}

/** Bağlantının görünen adı: `@kullanıcı` › ad › "Telegram". Telegram'dan geldiği için DOĞRULANMAMIŞ kullanıcı verisidir (yalnız metin olarak basılır). */
export function telegramLinkLabel(row: Pick<TelegramLinkRow, "username" | "name">): string {
  return row.username ? `@${row.username}` : row.name ?? "Telegram";
}
