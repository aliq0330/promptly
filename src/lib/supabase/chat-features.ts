import { supabase } from "./client";
import { translateForRuntime, type TranslationKey } from "@/lib/i18n/translations";
import { extractChatFeatureError, type ChatFeatureErrorCode } from "@/lib/chat-features";
import { mapMessageRow, MESSAGE_SELECT, type MessageRow } from "./messages";
import type { ConversationSearchHit, Message, MessageReceipt, PinnedMessage, StarredMessage } from "@/types";

/**
 * Sohbet geliştirmeleri veri erişimi (docs/history/174-*): okundu imleci, mesaj ayrıntısı, sabitleme, sohbet içi arama, yıldız.
 * Yetki ve kurallar veritabanındadır (SECURITY DEFINER RPC + RLS); burası çağırır, sonucu tiplendirir ve sunucunun makine
 * kodlarını çevrilmiş mesaja dönüştürür (ham SQL metni kullanıcıya gösterilmez).
 */

const ERROR_KEYS: Record<ChatFeatureErrorCode, TranslationKey> = {
  not_authenticated: "chat.error.generic",
  forbidden: "chat.error.forbidden",
  message_not_found: "chat.error.messageNotFound",
  pin_limit_reached: "chat.error.pinLimit",
  invalid_query: "chat.error.invalidQuery",
  star_limit_reached: "chat.error.starLimit",
};

export class ChatFeatureError extends Error {
  code: ChatFeatureErrorCode | null;
  constructor(code: ChatFeatureErrorCode | null, message: string) {
    super(message);
    this.name = "ChatFeatureError";
    this.code = code;
  }
}

export function toChatFeatureError(error: { message?: string } | null | undefined): ChatFeatureError {
  // Zaten çevrilmiş bir hata tekrar çevrilmez (aksi hâlde çevrilmiş metin koda eşlenemez ve genel mesaja düşerdi).
  if (error instanceof ChatFeatureError) return error;
  const code = extractChatFeatureError(error?.message);
  return new ChatFeatureError(code, translateForRuntime(code ? ERROR_KEYS[code] : "chat.error.generic"));
}

// ---------------------------------------------------------------------------------------------
// Okundu bilgisi
// ---------------------------------------------------------------------------------------------

/**
 * Okundu imlecimi `upTo` zamanına kadar ilerletir (yalnız ileri; sunucu mevcut mesajlarla sınırlar). Sunucu imleç ve sayaç
 * değişmediyse HİÇ yazmaz. En iyi çaba: hata mesajları görüntülemeyi engellemez; başarısızlıkta null döner.
 */
export async function markConversationReadUpTo(conversationId: string, upTo: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("mark_conversation_read_up_to", { p_conversation_id: conversationId, p_up_to: upTo });
    if (error) {
      console.error("markConversationReadUpTo", error);
      return null;
    }
    return typeof data === "string" ? data : null;
  } catch (err) {
    console.error("markConversationReadUpTo", err);
    return null;
  }
}

/** Birebir sohbette KARŞI tarafın okundu imleci (yalnız iki tarafın görebildiği üyelik satırı). Okunamazsa null. */
export async function fetchPartnerReadAt(conversationId: string, viewerId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("conversation_members")
      .select("last_read_at")
      .eq("conversation_id", conversationId)
      .neq("user_id", viewerId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { last_read_at: string | null }).last_read_at;
  } catch (err) {
    console.error("fetchPartnerReadAt", err);
    return null;
  }
}

interface ReceiptRow {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  has_read: boolean;
  read_at: string | null;
}

/** Bir mesajın okuyanları / okumayanları (yalnız mesajın göndericisi; gönderen listede yok). */
export async function fetchMessageReceipts(messageId: string): Promise<MessageReceipt[]> {
  const { data, error } = await supabase.rpc("message_read_receipts", { p_message_id: messageId });
  if (error) throw toChatFeatureError(error);
  return ((data ?? []) as ReceiptRow[]).map((row) => ({
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    hasRead: Boolean(row.has_read),
    readAt: row.read_at,
  }));
}

// ---------------------------------------------------------------------------------------------
// Sabitleme
// ---------------------------------------------------------------------------------------------

interface PinRow {
  message_id: string;
  conversation_id: string;
  pinned_by: string | null;
  pinned_at: string;
}

export function mapPinRow(row: PinRow): PinnedMessage {
  return { messageId: row.message_id, conversationId: row.conversation_id, pinnedBy: row.pinned_by, pinnedAt: row.pinned_at };
}

/** Konuşmanın sabitleri (en yeni sabitleme önce). RLS yalnız üyelere ve okuyabildikleri mesajlara izin verir. */
export async function fetchPins(conversationId: string): Promise<PinnedMessage[]> {
  const { data, error } = await supabase
    .from("pinned_messages")
    .select("message_id, conversation_id, pinned_by, pinned_at")
    .eq("conversation_id", conversationId)
    .order("pinned_at", { ascending: false })
    .limit(50);
  if (error) throw toChatFeatureError(error);
  return ((data ?? []) as PinRow[]).map(mapPinRow);
}

/**
 * Sabit mesajların içeriği (yüklenen sayfanın dışındakiler için). Mesaj bu kullanıcı için görünmezse (RLS, kişisel "benden sil",
 * kişisel "temizle") ya da silinmişse sonuçta OLMAZ — sabit, kullanıcının erişemediği içeriği göstermez.
 */
export async function fetchMessagesByIds(conversationId: string, viewerId: string, messageIds: string[]): Promise<Message[]> {
  const ids = [...new Set(messageIds)].slice(0, 50);
  if (ids.length === 0) return [];
  const [{ data, error }, { data: hidden }, { data: membership }] = await Promise.all([
    supabase.from("messages").select(MESSAGE_SELECT).eq("conversation_id", conversationId).in("id", ids),
    supabase.from("message_hidden_for").select("message_id").eq("user_id", viewerId).in("message_id", ids),
    supabase.from("conversation_members").select("cleared_at").eq("conversation_id", conversationId).eq("user_id", viewerId).maybeSingle(),
  ]);
  if (error) throw toChatFeatureError(error);
  const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string));
  const clearedAt = (membership as { cleared_at: string | null } | null)?.cleared_at ?? null;
  return (data ?? [])
    .map((row) => mapMessageRow(row as MessageRow))
    .filter((message) => !hiddenIds.has(message.id) && !message.deletedAt && (!clearedAt || message.createdAt > clearedAt));
}

/** Sunucu yetkiyi denetler (birebirde iki taraf; grupta rol/ayar). Idempotent. */
export async function setMessagePinned(messageId: string, pinned: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_message_pinned", { p_message_id: messageId, p_pinned: pinned });
  if (error) throw toChatFeatureError(error);
}

// ---------------------------------------------------------------------------------------------
// Sohbet içi arama
// ---------------------------------------------------------------------------------------------

export const SEARCH_PAGE_SIZE = 20;

interface SearchRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

/** Yalnız çağıranın görebildiği mesajlar (sunucu RLS + kişisel temizle/sil kuralları); keyset sayfalama, en yeniden eskiye. */
export async function searchConversationMessages(
  conversationId: string,
  query: string,
  before?: { createdAt: string; id: string },
): Promise<{ hits: ConversationSearchHit[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc("search_conversation_messages", {
    p_conversation_id: conversationId,
    p_query: query,
    p_limit: SEARCH_PAGE_SIZE + 1,
    p_before_created_at: before?.createdAt ?? null,
    p_before_id: before?.id ?? null,
  });
  if (error) throw toChatFeatureError(error);
  const rows = (data ?? []) as SearchRow[];
  return {
    hasMore: rows.length > SEARCH_PAGE_SIZE,
    hits: rows.slice(0, SEARCH_PAGE_SIZE).map((row) => ({ id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at })),
  };
}

// ---------------------------------------------------------------------------------------------
// Yıldızlı mesajlar (kişiye özel; mesaj kopyalanmaz)
// ---------------------------------------------------------------------------------------------

/** Bu konuşmada yıldızladığım mesajların kimlikleri (RLS: yalnız kendi satırlarım). */
export async function fetchStarredMessageIds(conversationId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("message_stars")
    .select("message_id, messages!inner(conversation_id)")
    .eq("messages.conversation_id", conversationId)
    .limit(1000);
  if (error) {
    console.error("fetchStarredMessageIds", error);
    return [];
  }
  return ((data ?? []) as { message_id: string }[]).map((row) => row.message_id);
}

/** Yıldızla: aynı mesaj tekrar yıldızlanırsa (yarış/çift tık) sessizce başarı sayılır. */
export async function starMessage(userId: string, messageId: string): Promise<void> {
  const { error } = await supabase.from("message_stars").insert({ user_id: userId, message_id: messageId });
  if (!error || error.message.toLowerCase().includes("duplicate key")) return;
  // RLS reddi = mesaj artık okunamıyor (silindi, gruptan ayrıldım, geçmiş kapalı…): dürüst "görüntülenemiyor".
  if (error.message.toLowerCase().includes("row-level security")) throw new ChatFeatureError("message_not_found", translateForRuntime("chat.error.messageNotFound"));
  throw toChatFeatureError(error);
}

export async function unstarMessage(userId: string, messageId: string): Promise<void> {
  const { error } = await supabase.from("message_stars").delete().eq("user_id", userId).eq("message_id", messageId);
  if (error) throw toChatFeatureError(error);
}

interface StarredRow {
  starred_at: string;
  message_id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  has_attachments: boolean;
  has_shared: boolean;
  created_at: string;
  kind: "direct" | "group";
  group_name: string | null;
  group_avatar_url: string | null;
  partner_id: string | null;
}

export const STARRED_PAGE_SIZE = 30;

/** Yıldızlı mesajlar, birebir + grup tek listede (en yeni yıldız önce). Erişimini yitirdiğim mesajlar sunucuda elenir. */
export async function fetchStarredMessages(
  viewerId: string,
  before?: { starredAt: string; messageId: string },
): Promise<{ items: StarredMessage[]; hasMore: boolean; cursor: { starredAt: string; messageId: string } | null }> {
  const { data, error } = await supabase.rpc("list_starred_messages", {
    p_limit: STARRED_PAGE_SIZE + 1,
    p_before_starred_at: before?.starredAt ?? null,
    p_before_message_id: before?.messageId ?? null,
  });
  if (error) throw toChatFeatureError(error);
  const rows = ((data ?? []) as StarredRow[]).slice(0, STARRED_PAGE_SIZE + 1);
  const hasMore = rows.length > STARRED_PAGE_SIZE;
  const page = rows.slice(0, STARRED_PAGE_SIZE);

  // Gönderen / karşı taraf adları (profiller herkese açık okunur); toplu tek sorgu.
  const ids = [...new Set(page.flatMap((row) => [row.sender_id, row.partner_id]).filter((id): id is string => Boolean(id)))];
  const profiles = new Map<string, { displayName: string; avatarUrl: string | null }>();
  if (ids.length > 0) {
    const { data: found } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids.slice(0, 100));
    for (const p of (found ?? []) as { id: string; display_name: string; avatar_url: string | null }[]) {
      profiles.set(p.id, { displayName: p.display_name, avatarUrl: p.avatar_url });
    }
  }

  const items = page.map((row): StarredMessage => {
    const sender = profiles.get(row.sender_id);
    const partner = row.partner_id ? profiles.get(row.partner_id) : undefined;
    return {
      messageId: row.message_id,
      conversationId: row.conversation_id,
      starredAt: row.starred_at,
      senderId: row.sender_id,
      senderName: row.sender_id === viewerId ? translateForRuntime("chat.starred.you") : (sender?.displayName ?? translateForRuntime("chat.starred.unknownUser")),
      body: row.body,
      hasAttachments: Boolean(row.has_attachments),
      hasShared: Boolean(row.has_shared),
      createdAt: row.created_at,
      kind: row.kind,
      chatName: row.kind === "group" ? (row.group_name ?? translateForRuntime("chat.starred.unknownGroup")) : (partner?.displayName ?? translateForRuntime("chat.starred.unknownUser")),
      chatAvatarUrl: row.kind === "group" ? row.group_avatar_url : (partner?.avatarUrl ?? null),
    };
  });
  const last = page[page.length - 1];
  return { items, hasMore, cursor: last ? { starredAt: last.starred_at, messageId: last.message_id } : null };
}
