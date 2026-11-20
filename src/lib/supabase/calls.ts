/**
 * Arama veri katmanı (docs/history/449-*): `calls` tablosuna YAZMA yalnız RPC'lerdir (`call_start`, `call_respond`); istemci tabloya
 * doğrudan insert/update yapamaz. Okuma RLS'tedir (yalnız arayan + aranan). Sinyalleşme (offer/answer/ICE) veritabanında DEĞİL,
 * `lib/webrtc/signaling.ts` içindedir.
 */
import { supabase } from "@/lib/supabase/client";
import { mapCallRow } from "@/lib/webrtc/call-rules";
import type { CallAction, CallRow, CallType } from "@/lib/webrtc/types";

function toRow(data: unknown): CallRow {
  const row = mapCallRow(data);
  if (!row) throw new Error("call_invalid_response");
  return row;
}

/** Arama başlatır. Hata metni sunucu kodunu taşır (`call_busy` …); `classifyCallStartError` ile sınıflanır. */
export async function startCallRpc(conversationId: string, type: CallType): Promise<CallRow> {
  const { data, error } = await supabase.rpc("call_start", { p_conversation_id: conversationId, p_type: type });
  if (error) throw new Error(error.message);
  return toRow(data);
}

/** Kabul / red / vazgeç / zaman aşımı / bitir. Dönen satırın durumu gerçek sonucu söyler (ör. süresi dolan çağrıda `accept` → `missed`). */
export async function respondCallRpc(callId: string, action: CallAction, reason?: string): Promise<CallRow> {
  const { data, error } = await supabase.rpc("call_respond", { p_call_id: callId, p_action: action, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
  return toRow(data);
}

/** Bana ait açık çağrılar (gelen çalan arama + yarım kalmış görüşme); süresi dolanlar sunucuda önce kapatılır. */
export async function fetchMyOpenCalls(): Promise<CallRow[]> {
  const { data, error } = await supabase.rpc("calls_my_open");
  if (error) {
    console.error("fetchMyOpenCalls", error);
    return [];
  }
  // Beklenmeyen yanıt (eski/eksik sunucu, taklit): çökme yerine "açık çağrı yok".
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapCallRow(row)).filter((row): row is CallRow => row !== null);
}

const CALL_COLUMNS = "id, conversation_id, caller_id, callee_id, type, status, started_at, answered_at, ended_at";
const TERMINAL = ["ended", "rejected", "missed"];

function mapRows(data: unknown): CallRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => mapCallRow(row)).filter((row): row is CallRow => row !== null);
}

/**
 * Aramalar bölümü: BENİM bitmiş çağrılarım, en yeni önce, `before` (başlangıç anı) imleciyle sayfalı (docs/history/450-*).
 * RLS yalnız arayan/aranan satırı verir; ek süzgeç yalnız kapsamı netleştirir.
 */
export async function fetchCallHistory(userId: string, before: string | null, limit = 30): Promise<CallRow[]> {
  let query = supabase
    .from("calls")
    .select(CALL_COLUMNS)
    .in("status", TERMINAL)
    .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("started_at", before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return mapRows(data);
}

/** Bir sohbetin bitmiş çağrıları (sohbet akışına karışır); en yeni 100. */
export async function fetchConversationCalls(conversationId: string, limit = 100): Promise<CallRow[]> {
  const { data, error } = await supabase
    .from("calls")
    .select(CALL_COLUMNS)
    .eq("conversation_id", conversationId)
    .in("status", TERMINAL)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return mapRows(data);
}

export interface MyCallSettings {
  privacy: "everyone" | "following" | "nobody";
  notifyMissed: boolean;
}

export const DEFAULT_CALL_SETTINGS: MyCallSettings = { privacy: "everyone", notifyMissed: true };

/** Arama ayarlarım (sunucu varsayılanları satır yoksa verir). */
export async function fetchMyCallSettings(): Promise<MyCallSettings> {
  const { data, error } = await supabase.rpc("get_my_call_settings");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  const privacy = row && (row.privacy === "following" || row.privacy === "nobody" || row.privacy === "everyone") ? row.privacy : "everyone";
  return { privacy, notifyMissed: row ? row.notify_missed !== false : true };
}

export async function saveMyCallSettings(next: MyCallSettings): Promise<void> {
  const { error } = await supabase.rpc("set_my_call_settings", { p_privacy: next.privacy, p_notify_missed: next.notifyMissed });
  if (error) throw new Error(error.message);
}
