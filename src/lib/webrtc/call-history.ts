/**
 * Arama geçmişi SAF kuralları (docs/history/450-*): bir çağrı satırının "benim için" anlamı (giden/gelen, sonuç, süre), sohbet akışına
 * serpiştirme, gün gruplama, mesaj listesi önizlemesi. Çerçeveden bağımsızdır, `npm test` ile sınanır; veritabanı okuması
 * `lib/supabase/calls.ts`'tedir (RLS: yalnız arayan/aranan okur).
 */
import type { CallRow, CallType } from "./types.ts";

export type CallDirection = "out" | "in";
/** completed = görüşüldü · missed = gelen, açmadım · unanswered = giden, açılmadı · declined = giden, karşı taraf reddetti · rejected = gelen, ben reddettim. */
export type CallOutcome = "completed" | "missed" | "unanswered" | "declined" | "rejected";

export interface CallSummary {
  direction: CallDirection;
  outcome: CallOutcome;
  type: CallType;
  /** Görüşme süresi (sn); yalnız `completed`. */
  durationSec: number;
  /** Kaydın zamanı (ISO): bitiş, yoksa başlangıç. */
  at: string;
}

/** Çalan/süren çağrılar geçmişte görünmez (null). */
export function summarizeCall(row: CallRow, userId: string): CallSummary | null {
  const direction: CallDirection = row.callerId === userId ? "out" : "in";
  const at = row.endedAt ?? row.startedAt;
  let outcome: CallOutcome;
  switch (row.status) {
    case "ended":
      outcome = "completed";
      break;
    case "missed":
      outcome = direction === "in" ? "missed" : "unanswered";
      break;
    case "rejected":
      outcome = direction === "out" ? "declined" : "rejected";
      break;
    default:
      return null;
  }
  let durationSec = 0;
  if (outcome === "completed" && row.answeredAt && row.endedAt) {
    const ms = Date.parse(row.endedAt) - Date.parse(row.answeredAt);
    durationSec = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : 0;
  }
  return { direction, outcome, type: row.type, durationSec, at };
}

/** "Cevapsız" sayılan sonuç (kırmızı gösterilir, geri arama önerilir). */
export function isMissedForMe(summary: CallSummary): boolean {
  return summary.outcome === "missed";
}

export function callTime(row: CallRow): number {
  const t = Date.parse(row.endedAt ?? row.startedAt);
  return Number.isFinite(t) ? t : 0;
}

/** En yeni üstte; aynı anda biten çağrılarda kimliğe göre kararlı. */
export function sortCallsNewestFirst(rows: readonly CallRow[]): CallRow[] {
  return [...rows].sort((a, b) => callTime(b) - callTime(a) || (a.id < b.id ? 1 : -1));
}

/** Satırı kimliğine göre ekler/günceller (Realtime tekrarları çoğaltmaz); geçmişte görünmeyen (çalan) satır eklenmez, varsa kaldırılır. */
export function upsertCall(rows: readonly CallRow[], row: CallRow, userId: string): CallRow[] {
  const without = rows.filter((r) => r.id !== row.id);
  if (!summarizeCall(row, userId)) return [...without];
  return sortCallsNewestFirst([...without, row]);
}

export type TimelineEntry<M> = { kind: "message"; index: number; message: M; dayStart: boolean } | { kind: "call"; call: CallRow; dayStart: boolean };

/**
 * Mesajları (eskiden yeniye) ve çağrıları zaman sırasıyla birleştirir. `dayStart` birleşik dizi üzerinden hesaplanır (arama kaydı günün ilk
 * öğesiyse o gün ayracı onunla açılır, ardından gelen mesajda tekrarlanmaz). Çağrılar yalnız yüklü mesaj penceresinin içinde görünür:
 * en eski yüklü mesajdan eski olanlar, daha eski sayfa YOKSA ya da hiç mesaj yoksa gösterilir.
 */
export function interleaveCalls<M extends { createdAt: string }>(
  messages: readonly M[],
  calls: readonly CallRow[],
  opts: { hasOlder: boolean; dayKey: (iso: string) => string; userId: string },
): TimelineEntry<M>[] {
  const oldest = messages.length ? Date.parse(messages[0]!.createdAt) : Number.NEGATIVE_INFINITY;
  const visible = calls
    .filter((c) => summarizeCall(c, opts.userId) !== null)
    .filter((c) => !opts.hasOlder || messages.length === 0 || callTime(c) >= oldest)
    .sort((a, b) => callTime(a) - callTime(b));
  const out: TimelineEntry<M>[] = [];
  let ci = 0;
  const pushCall = (c: CallRow) => out.push({ kind: "call", call: c, dayStart: false });
  messages.forEach((message, index) => {
    const t = Date.parse(message.createdAt);
    while (ci < visible.length && callTime(visible[ci]!) <= t) pushCall(visible[ci++]!);
    out.push({ kind: "message", index, message, dayStart: false });
  });
  while (ci < visible.length) pushCall(visible[ci++]!);
  let prevKey: string | null = null;
  for (const entry of out) {
    const iso = entry.kind === "message" ? entry.message.createdAt : (entry.call.endedAt ?? entry.call.startedAt);
    const key = opts.dayKey(iso);
    entry.dayStart = prevKey === null || key !== prevKey;
    prevKey = key;
  }
  return out;
}

/** Konuşma başına en yeni çağrı (mesaj listesi önizlemesi için). */
export function lastCallByConversation(rows: readonly CallRow[], userId: string): Map<string, CallRow> {
  const out = new Map<string, CallRow>();
  for (const row of sortCallsNewestFirst(rows)) {
    if (!summarizeCall(row, userId)) continue;
    if (!out.has(row.conversationId)) out.set(row.conversationId, row);
  }
  return out;
}

/** Önizleme son mesajın yerine çağrıyı mı göstermeli? Çağrı son mesajdan yeniyse evet. */
export function callPreviewWins(lastMessageAt: string | null | undefined, call: CallRow | undefined): boolean {
  if (!call) return false;
  const m = lastMessageAt ? Date.parse(lastMessageAt) : Number.NaN;
  return !Number.isFinite(m) || callTime(call) > m;
}

/** Cevapsız (gelen) çağrı sayısı: Aramalar menüsündeki rozet. */
export function missedCount(rows: readonly CallRow[], userId: string): number {
  return rows.filter((r) => r.calleeId === userId && r.status === "missed").length;
}

export type CallFilter = "all" | "missed" | "audio" | "video";

export function filterCalls(rows: readonly CallRow[], filter: CallFilter, userId: string): CallRow[] {
  return rows.filter((r) => {
    if (!summarizeCall(r, userId)) return false;
    if (filter === "missed") return r.calleeId === userId && r.status === "missed";
    if (filter === "audio" || filter === "video") return r.type === filter;
    return true;
  });
}

/** Karşı tarafın kimliği. */
export function otherParty(row: CallRow, userId: string): string {
  return row.callerId === userId ? row.calleeId : row.callerId;
}
