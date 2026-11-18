import { supabase } from "./client";
import { parseQuietHoursRow, type QuietHours } from "@/lib/live-notification-prefs";

/**
 * Rahatsız etme saatleri (docs/history/435-*): hesap başına, `notification_quiet_hours` istemciye kapalı — okuma/yazma yalnız bu iki RPC.
 * Sunucu saat dilimini (IANA) doğrular; kural veritabanında Telegram anlık bildirimini de susturur (`push_suppressed`).
 */
export async function fetchMyQuietHours(): Promise<QuietHours> {
  const { data, error } = await supabase.rpc("get_my_quiet_hours");
  if (error) throw new Error(error.message);
  return parseQuietHoursRow(Array.isArray(data) ? data[0] : data);
}

export async function saveMyQuietHours(q: QuietHours): Promise<QuietHours> {
  const { data, error } = await supabase.rpc("set_my_quiet_hours", { p_enabled: q.enabled, p_start: q.startMinute, p_end: q.endMinute, p_tz: q.tz });
  if (error) throw new Error(error.message);
  return parseQuietHoursRow(Array.isArray(data) ? data[0] : data);
}
