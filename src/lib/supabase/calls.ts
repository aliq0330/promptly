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
