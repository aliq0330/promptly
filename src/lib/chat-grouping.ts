import type { Message } from "@/types";

/** Aynı kişinin bu süreden yakın mesajları tek öbek sayılır (avatar/ad bir kez, kuyruk köşesi öbeğin sonunda). */
const GROUP_GAP_MS = 5 * 60 * 1000;

/** Yerel takvim günü anahtarı (gün ayracı için). */
export function chatDayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** İki mesaj aynı öbekte mi: aynı gönderen, aynı gün, kısa aralık; duyuru kartı hiçbir öbeğe girmez. */
export function sameChatGroup(a: Message, b: Message): boolean {
  if (a.senderId !== b.senderId) return false;
  if (a.announcementId || b.announcementId) return false;
  if (chatDayKey(a.createdAt) !== chatDayKey(b.createdAt)) return false;
  return Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) <= GROUP_GAP_MS;
}

export interface ChatMessageLayout {
  /** Önceki mesajdan farklı gün: önüne gün ayracı çizilir. */
  dayStart: boolean;
  /** Öbeğin ilk mesajı (grup sohbetinde avatar + ad burada). */
  groupStart: boolean;
  /** Öbeğin son mesajı (kuyruk köşesi burada). */
  groupEnd: boolean;
}

/** `messages` zaman sırasıyla (eskiden yeniye); her mesaj için gün/öbek konumunu verir. */
export function layoutChatMessages(messages: Message[]): ChatMessageLayout[] {
  return messages.map((message, index) => {
    const prev = messages[index - 1];
    const next = messages[index + 1];
    return {
      dayStart: !prev || chatDayKey(prev.createdAt) !== chatDayKey(message.createdAt),
      groupStart: !prev || !sameChatGroup(prev, message),
      groupEnd: !next || !sameChatGroup(message, next),
    };
  });
}

/** Mesaj saati (gün ayracının altında gösterilir): 24 saat, yerel saat. */
export function formatClockTime(iso: string, language: "tr" | "en"): string {
  return new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}
