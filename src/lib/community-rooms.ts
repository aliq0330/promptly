/**
 * Topluluk sohbet odalarının SAF kuralları (docs/history/352-*): ad → "#slug", bölümlere gruplama, hangi odanın açılacağı,
 * "ne olacak" cümlesi, son açılan odanın hatırlanması. Çerçeveden bağımsızdır (`npm test` ile sınanır).
 *
 * ÖNEMLİ: buradaki kurallar yalnızca arayüzün NE GÖSTERECEĞİNİ belirler; gerçek yetki ve doğrulama veritabanındadır
 * (`supabase/migrations/20261109100000_community_rooms.sql`: RLS + SECURITY DEFINER RPC'ler).
 */
import type { CommunityRoom, CommunityRoomIcon } from "../types/index.ts";

/** Topluluk başına en çok etkin (arşivsiz) oda; sunucudaki sınırla aynı. */
export const ROOM_LIMIT = 20;
export const ROOM_NAME_MAX = 40;
export const ROOM_DESCRIPTION_MAX = 120;
export const ROOM_SECTION_MAX = 24;

/** Oda simgeleri (DB CHECK ile aynı sıra). Simge bileşeni eşlemesi `features/messages/rooms/room-icon.tsx`'tedir. */
export const ROOM_ICONS: readonly CommunityRoomIcon[] = ["message", "prompt", "image", "megaphone", "sparkles", "help", "shield", "palette"];

const TR_FOLD: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };

/** "Prompt Paylaşımı" → "prompt-paylasimi" (liste önizlemesindeki "# prompt-paylasimi" etiketi ve yazma kutusu ipucu). */
export function roomSlug(name: string): string {
  const folded = [...name.trim()].map((ch) => TR_FOLD[ch] ?? ch).join("");
  const slug = folded
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "oda";
}

export function validateRoomName(name: string): "ok" | "empty" | "tooLong" {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "empty";
  return trimmed.length > ROOM_NAME_MAX ? "tooLong" : "ok";
}

export interface RoomSectionGroup {
  /** Sıralamada kararlı anahtar: boş bölüm için "" (varsayılan bölüm). */
  key: string;
  /** Başlık: kullanıcının yazdığı bölüm adı; boşsa `defaultLabel`. */
  label: string;
  rooms: CommunityRoom[];
}

/**
 * Odaları bölümlere ayırır: arşivliler hariç, `position` sırasıyla; bölümlerin sırası ilk görünüş sırasıdır
 * (boş bölüm = `defaultLabel`). Aynı adlı bölümler (büyük/küçük harf farkı yok sayılır) birleşir.
 */
export function groupRoomsBySection(rooms: readonly CommunityRoom[], defaultLabel: string): RoomSectionGroup[] {
  const ordered = rooms.filter((room) => !room.archivedAt).sort((a, b) => a.position - b.position);
  const groups: RoomSectionGroup[] = [];
  const index = new Map<string, RoomSectionGroup>();
  for (const room of ordered) {
    const raw = room.section?.trim() ?? "";
    const key = raw.toLocaleLowerCase("tr");
    let group = index.get(key);
    if (!group) {
      group = { key, label: raw || defaultLabel, rooms: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.rooms.push(room);
  }
  return groups;
}

/** Bölümlerin sunulan adları (oda ekle formundaki seçici): varsayılan bölüm + kullanılan bölüm adları. */
export function sectionChoices(rooms: readonly CommunityRoom[]): string[] {
  const seen = new Map<string, string>();
  for (const room of rooms) {
    const raw = room.section?.trim();
    if (raw && !seen.has(raw.toLocaleLowerCase("tr"))) seen.set(raw.toLocaleLowerCase("tr"), raw);
  }
  return [...seen.values()];
}

export function activeRooms(rooms: readonly CommunityRoom[]): CommunityRoom[] {
  return rooms.filter((room) => !room.archivedAt).sort((a, b) => a.position - b.position);
}

export function archivedRooms(rooms: readonly CommunityRoom[]): CommunityRoom[] {
  return rooms.filter((room) => room.archivedAt);
}

/** Topluluğun okunmamış toplamı: sessize alınmamış, arşivsiz odalar (sunucudaki `group_unread_counts` ile aynı kural). */
export function totalRoomUnread(rooms: readonly CommunityRoom[]): number {
  return rooms.filter((room) => !room.archivedAt && !room.muted).reduce((sum, room) => sum + room.unreadCount, 0);
}

export function defaultRoom(rooms: readonly CommunityRoom[]): CommunityRoom | null {
  return rooms.find((room) => room.isDefault) ?? null;
}

/**
 * Açılacak oda: adresten gelen geçerli oda > en son açılan geçerli oda > varsayılan oda > ilk etkin oda.
 * Arşivli oda da AÇILABİLİR (okunur) ama yalnız adresle istenmişse; "son açılan" olarak arşivli seçilmez.
 */
export function pickRoom(rooms: readonly CommunityRoom[], requestedId: string | null | undefined, lastId: string | null | undefined): CommunityRoom | null {
  if (requestedId) {
    const requested = rooms.find((room) => room.id === requestedId);
    if (requested) return requested;
  }
  const active = activeRooms(rooms);
  if (lastId) {
    const last = active.find((room) => room.id === lastId);
    if (last) return last;
  }
  return defaultRoom(rooms) ?? active[0] ?? null;
}

/** Mesaj sorgularında/gönderimde kullanılan oda kimliği: varsayılan oda NULL'dur (eski mesajlar ve eski istemciler için). */
export function messageRoomId(room: Pick<CommunityRoom, "id" | "isDefault"> | null | undefined): string | null {
  return room && !room.isDefault ? room.id : null;
}

export type RoomOutcomeKey = "rooms.outcome.open" | "rooms.outcome.adminsWrite" | "rooms.outcome.staffOnly" | "rooms.outcome.staffOnlyAdminsWrite";

/** "Ne olacak" cümlesinin anahtarı: oda kimlere görünür, kimler yazar (oda ekle/düzenle formunun altı). */
export function roomOutcomeKey(readPolicy: "all" | "staff", postingPolicy: "members" | "admins"): RoomOutcomeKey {
  if (readPolicy === "staff") return postingPolicy === "admins" ? "rooms.outcome.staffOnlyAdminsWrite" : "rooms.outcome.staffOnly";
  return postingPolicy === "admins" ? "rooms.outcome.adminsWrite" : "rooms.outcome.open";
}

// ---------------------------------------------------------------------------------------------
// Son açılan oda (yalnız cihazda; kişisel kolaylık — sunucuda iz yok)
// ---------------------------------------------------------------------------------------------

const LAST_ROOM_PREFIX = "promptly-last-room:";

export function lastRoomStorageKey(communityId: string): string {
  return `${LAST_ROOM_PREFIX}${communityId}`;
}

export function readLastRoomId(communityId: string, storage: Pick<Storage, "getItem"> | undefined = typeof window !== "undefined" ? safeStorage() : undefined): string | null {
  try {
    return storage?.getItem(lastRoomStorageKey(communityId)) ?? null;
  } catch {
    return null;
  }
}

export function rememberLastRoomId(communityId: string, roomId: string, storage: Pick<Storage, "setItem"> | undefined = typeof window !== "undefined" ? safeStorage() : undefined): void {
  try {
    storage?.setItem(lastRoomStorageKey(communityId), roomId);
  } catch {
    // Depolama kapalı/dolu: hatırlanmaz, ekran yine çalışır.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Sohbet listesi sıralaması: sabitlenenler (en yeni sabitlenen önce) başta, sonra son mesaj zamanına göre. */
export function comparePinnedFirst<T extends { pinnedAt?: string | null; lastMessageAt: string }>(a: T, b: T): number {
  const pa = a.pinnedAt ?? null;
  const pb = b.pinnedAt ?? null;
  if (pa && !pb) return -1;
  if (!pa && pb) return 1;
  if (pa && pb && pa !== pb) return pa < pb ? 1 : -1;
  return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
}
