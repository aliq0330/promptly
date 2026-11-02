import { supabase } from "./client";
import { mapTelegramLinkRow, type TelegramLinkRow } from "@/lib/telegram-link";

/**
 * Telegram botu veri katmanı (docs/history/323-*): dört RPC. Tablolar istemciye KAPALIdır; kimlik hep `auth.uid()`.
 * Bağlama kodu yalnız `createTelegramLinkCode` yanıtında bir kez döner (sunucuda yalnız özeti durur) ve 10 dakika geçerlidir.
 * Bilinen sunucu kodları (`link_limit`, `rate_limit`) `server-errors.ts` ile çevrilmiş mesajla gelir.
 */

export interface TelegramLinkCode {
  code: string;
  expiresAt: string;
  write: boolean;
}

export async function listMyTelegramLinks(): Promise<TelegramLinkRow[]> {
  const { data, error } = await supabase.rpc("list_my_telegram_links");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : [])
    .map((raw) => mapTelegramLinkRow(raw as Record<string, unknown>))
    .filter((row): row is TelegramLinkRow => row !== null);
}

export async function createTelegramLinkCode(write: boolean): Promise<TelegramLinkCode> {
  const { data, error } = await supabase.rpc("telegram_link_code_create", { p_write: write });
  if (error) throw new Error(error.message);
  const body = (data ?? {}) as Record<string, unknown>;
  if (typeof body.code !== "string" || typeof body.expires_at !== "string") throw new Error("telegram_link_code_create: unexpected response");
  return { code: body.code, expiresAt: body.expires_at, write: body.write === true };
}

/** Bu çağrıda kaldırıldıysa true. Bot o andan sonra hesaba erişemez. */
export async function revokeMyTelegramLink(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_my_telegram_link", { p_id: id });
  if (error) throw new Error(error.message);
  return data === true;
}

export async function setMyTelegramNotify(id: string, weekly: boolean | null, activity: boolean | null): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_my_telegram_notify", { p_id: id, p_weekly: weekly, p_activity: activity });
  if (error) throw new Error(error.message);
  return data === true;
}
