/**
 * Sohbet geliştirmelerinin SAF kuralları (docs/history/174-*): okundu bilgisi, "yazıyor" durumu, sabitleme yetkisi, sohbet içi
 * arama girdisi. Çerçeveden bağımsızdır, `npm test` ile sınanır.
 *
 * ÖNEMLİ: buradaki yetki/doğrulama fonksiyonları yalnızca arayüzün NE GÖSTERECEĞİNİ belirler. Gerçek denetim veritabanındadır
 * (`set_message_pinned`, `search_conversation_messages`, `message_stars` RLS, Realtime yetkilendirmesi).
 */
import { can } from "./chat-groups.ts";
import type { ChatGroup } from "@/types";

// ---------------------------------------------------------------------------------------------
// Okundu bilgisi
// ---------------------------------------------------------------------------------------------

export type ReadState = "sent" | "read";

function ms(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
}

/**
 * Birebir sohbette BENİM mesajımın durumu: karşı tarafın okundu imleci mesajın zamanına ulaştıysa "read", aksi hâlde "sent".
 * ("Ulaştı/delivered" ayrı bir durum değildir: cihaza ulaşma güvenilir biçimde bilinemez, bu yüzden gösterilmez.)
 */
export function readStateFor(messageCreatedAt: string, partnerReadAt: string | null | undefined): ReadState {
  const read = ms(partnerReadAt);
  const created = ms(messageCreatedAt);
  return Number.isFinite(read) && Number.isFinite(created) && read >= created ? "read" : "sent";
}

/** İmleç yalnız ileri gider: gelen değer eskisinden eskiyse eskisi korunur (gecikmiş/yinelenen Realtime olayı geri almaz). */
export function advanceReadAt(current: string | null | undefined, incoming: string | null | undefined): string | null {
  const a = ms(current);
  const b = ms(incoming);
  if (!Number.isFinite(b)) return current ?? null;
  if (!Number.isFinite(a) || b > a) return incoming ?? null;
  return current ?? null;
}

/**
 * Bu görüntüleme için sunucuya bildirilecek yeni okundu imleci, ya da gerek yoksa null. Yalnız BAŞKALARININ mesajları sayılır
 * (kendi mesajım benim için "okunmamış" değildir); son bildirilenden ileri değilse null döner → aynı mesaj için ikinci yazma yok.
 */
export function nextReadAck(
  messages: readonly { senderId: string; createdAt: string }[],
  viewerId: string,
  lastAcked: string | null,
): string | null {
  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const message of messages) {
    if (message.senderId === viewerId) continue;
    const t = ms(message.createdAt);
    if (Number.isFinite(t) && t > newestMs) {
      newestMs = t;
      newest = message.createdAt;
    }
  }
  if (!newest) return null;
  const acked = ms(lastAcked);
  return Number.isFinite(acked) && acked >= newestMs ? null : newest;
}

// ---------------------------------------------------------------------------------------------
// "Yazıyor…"
// ---------------------------------------------------------------------------------------------

/** Yazarken en sık bu aralıkla "yazıyor" sinyali gönderilir (her tuş vuruşunda değil). */
export const TYPING_SEND_INTERVAL_MS = 2500;
/** Tuş vuruşu bu kadar süre durursa "yazmayı bıraktı" sinyali gönderilir. */
export const TYPING_IDLE_MS = 4000;
/** Karşıdan gelen sinyal bu süre sonra, yenisi gelmezse kendiliğinden söner (çevrimdışı kalan sonsuza dek "yazıyor" kalmaz). */
export const TYPING_EXPIRE_MS = 6000;
/** Aynı anda gösterilen/izlenen en fazla yazan kişi (büyük grupta bellek ve gürültü sınırı). */
export const TYPING_MAX_TRACKED = 20;

/** Gönderici tarafı kısıtlama: son sinyalden bu yana yeterli süre geçtiyse yenisini gönder. */
export function shouldSendTyping(lastSentAt: number | null, now: number): boolean {
  return lastSentAt === null || now - lastSentAt >= TYPING_SEND_INTERVAL_MS;
}

/** Alıcı tarafı: kimin ne zamana kadar "yazıyor" sayıldığını tutan saf yapı (zamanlayıcıyı çağıran bağlar). */
export class TypingTracker {
  private readonly expiries = new Map<string, number>();

  /** Yazma sinyali geldi; kişi `now + TTL`'e kadar yazıyor sayılır. Beklenmedik kalabalıkta en eskisi atılır. */
  receive(userId: string, now: number): void {
    this.expiries.delete(userId);
    this.expiries.set(userId, now + TYPING_EXPIRE_MS);
    if (this.expiries.size > TYPING_MAX_TRACKED) {
      const oldest = this.expiries.keys().next().value;
      if (oldest !== undefined) this.expiries.delete(oldest);
    }
  }

  /** Kişi yazmayı bıraktı / mesaj gönderdi / ayrıldı. */
  stop(userId: string): void {
    this.expiries.delete(userId);
  }

  clear(): void {
    this.expiries.clear();
  }

  /** Süresi dolanlar temizlenir; hâlâ yazan kişiler (gelişine göre) döner. */
  active(now: number): string[] {
    for (const [userId, expiry] of this.expiries) if (expiry <= now) this.expiries.delete(userId);
    return [...this.expiries.keys()];
  }

  /** En yakın sönme zamanına kalan ms (zamanlayıcı kurmak için); kimse yazmıyorsa null. */
  nextExpiryIn(now: number): number | null {
    let soonest: number | null = null;
    for (const expiry of this.expiries.values()) if (soonest === null || expiry < soonest) soonest = expiry;
    return soonest === null ? null : Math.max(0, soonest - now);
  }
}

/**
 * "Ali yazıyor…" / "Ali ve Veli yazıyor…" / "Ali ve 2 kişi yazıyor…". `names` zaten görünürlük kurallarına göre çözülmüş
 * görünen adlardır; adı çözülemeyen kişi sayılır ama adlandırılmaz. Birebir sohbette ad gösterilmez ("yazıyor…").
 */
export function formatTypingText(names: readonly string[], unnamedCount: number, isGroup: boolean, t: (key: string, params?: Record<string, string | number>) => string): string {
  const total = names.length + unnamedCount;
  if (total === 0) return "";
  if (!isGroup) return t("chat.typing.direct");
  if (names.length === 0) return t("chat.typing.someone", { count: total });
  if (total === 1) return t("chat.typing.one", { name: names[0] });
  if (total === 2 && names.length === 2) return t("chat.typing.two", { a: names[0], b: names[1] });
  return t("chat.typing.many", { name: names[0], count: total - 1 });
}

/** Sinyal kanalının adı: yalnız konuşma kimliği (sunucudaki `can_use_typing_topic` ile aynı biçim). */
export function typingTopic(conversationId: string): string {
  return `typing:${conversationId}`;
}

// ---------------------------------------------------------------------------------------------
// Sabitleme
// ---------------------------------------------------------------------------------------------

/** Konuşma başına en çok sabit mesaj (sunucuda da 20). */
export const PIN_LIMIT = 20;

/** Bu kullanıcı sabitleyebilir/kaldırabilir mi (sunucudaki `set_message_pinned` ile aynı kural). Birebirde iki taraf da. */
export function canPinMessages(group: ChatGroup | null | undefined): boolean {
  if (!group) return true;
  if (can(group.myRole, "pin_messages", group.rolePermissions)) return true;
  return group.myRole === "member" && group.membersCanPin;
}

// ---------------------------------------------------------------------------------------------
// Sohbet içi arama
// ---------------------------------------------------------------------------------------------

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 100;

/** Aranacak terim geçerliyse kırpılmış hâli, değilse null (sunucu da 2–100 karakter dışını reddeder). */
export function normalizeSearchTerm(raw: string): string | null {
  const term = raw.trim();
  const length = [...term].length;
  return length >= SEARCH_MIN_CHARS && length <= SEARCH_MAX_CHARS ? term : null;
}

function fold(text: string): string {
  // Uzunluğu değiştirmeden (indeksler korunsun) tek tek karakter küçültme: "İ" gibi çok karakterli sonuç verenler olduğu gibi kalır.
  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Sonuç metnini, aranan terimin (büyük/küçük harfe duyarsız) geçtiği yerlerden parçalar; arayüz eşleşmeyi vurgular. Regex kullanılmaz. */
export function splitHighlight(text: string, term: string): HighlightPart[] {
  const needle = fold(term.trim());
  if (!needle) return [{ text, match: false }];
  const haystack = fold(text);
  const parts: HighlightPart[] = [];
  let from = 0;
  while (from < text.length) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    if (at > from) parts.push({ text: text.slice(from, at), match: false });
    parts.push({ text: text.slice(at, at + needle.length), match: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts.length > 0 ? parts : [{ text, match: false }];
}

/** Uzun mesajı eşleşmenin çevresinde kısaltır (liste satırı için). */
export function snippetAround(text: string, term: string, radius = 60): string {
  const at = fold(text).indexOf(fold(term.trim()));
  if (at <= radius || at === -1) return text.length > radius * 2 ? `${text.slice(0, radius * 2)}…` : text;
  const start = at - radius;
  const end = Math.min(text.length, at + term.length + radius);
  return `…${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

/** Sonuç listesinde gezinme: bir sonrakine/öncekine döngüsel geçiş (liste tarihe göre azalan: 0 = en yeni). */
export function stepIndex(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : total - 1;
  return (current + direction + total) % total;
}

// ---------------------------------------------------------------------------------------------
// Sunucu hata kodları
// ---------------------------------------------------------------------------------------------

export const CHAT_FEATURE_ERROR_CODES = ["not_authenticated", "forbidden", "message_not_found", "pin_limit_reached", "invalid_query", "star_limit_reached"] as const;
export type ChatFeatureErrorCode = (typeof CHAT_FEATURE_ERROR_CODES)[number];

/** PostgREST hata metninden bilinen kodu çıkarır (ham SQL metni kullanıcıya gösterilmez); yoksa null. */
export function extractChatFeatureError(message: string | null | undefined): ChatFeatureErrorCode | null {
  if (!message) return null;
  return CHAT_FEATURE_ERROR_CODES.find((code) => message.includes(code)) ?? null;
}
