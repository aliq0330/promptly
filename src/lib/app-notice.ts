/** Bileşen ağacının dışından (ör. Supabase istek katmanı) kısa bir bildirim göstermek için: `NoticeHost` dinler. */
export const NOTICE_EVENT = "promptly:notice";

/** `durationMs` verilmezse varsayılan kısa süre; uzun, okunması gereken uyarılar için daha uzun süre verilir. */
export function announceNotice(message: string, durationMs?: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string | { message: string; durationMs?: number }>(NOTICE_EVENT, { detail: durationMs ? { message, durationMs } : message }));
}
