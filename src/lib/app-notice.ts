/** Bileşen ağacının dışından (ör. Supabase istek katmanı) kısa bir bildirim göstermek için: `NoticeHost` dinler. */
export const NOTICE_EVENT = "promptly:notice";

export function announceNotice(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(NOTICE_EVENT, { detail: message }));
}
