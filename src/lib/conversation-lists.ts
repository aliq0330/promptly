/**
 * Pure rules for which of the viewer's own conversations show where. Archive,
 * "delete from my list" and "clear history" are per-member state on the
 * viewer's own membership row (`archived_at` / `deleted_at` / `cleared_at`),
 * so every list is derived from the same set of rows the viewer already has —
 * no second store.
 */

import { comparePinnedFirst } from "./community-rooms.ts";

export interface ConversationListFields {
  /** Kişisel sohbet sabitleme (docs/history/352-*): doluysa gelen kutusunun başında durur. */
  pinnedAt?: string | null;
  myStatus: "accepted" | "pending";
  archivedAt: string | null;
  deletedAt: string | null;
  unreadCount: number;
  lastMessageAt: string;
  /** Kişisel sessize alma (grup): okunmamış sayısı listede görünür ama başlıktaki noktayı yakmaz. */
  mutedAt?: string | null;
}

export interface ConversationBuckets<T> {
  /** Unaccepted message requests (never archived/deleted — they have their own accept / delete flow). */
  requests: T[];
  /** Accepted chats that are neither archived nor deleted: the normal inbox. */
  inbox: T[];
  /** Accepted chats the viewer archived: the "Arşivlenenler" view. */
  archived: T[];
}

function byNewest<T extends ConversationListFields>(a: T, b: T): number {
  return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
}

/** Splits every membership row into the three lists; a chat the viewer deleted from their list appears in none. */
export function bucketConversations<T extends ConversationListFields>(conversations: readonly T[]): ConversationBuckets<T> {
  const requests: T[] = [];
  const inbox: T[] = [];
  const archived: T[] = [];
  for (const conversation of conversations) {
    if (conversation.deletedAt) continue;
    if (conversation.myStatus === "pending") requests.push(conversation);
    else if (conversation.archivedAt) archived.push(conversation);
    else inbox.push(conversation);
  }
  return { requests: requests.sort(byNewest), inbox: inbox.sort(comparePinnedFirst), archived: archived.sort(byNewest) };
}

/** The header's unread dot: only chats that are actually listed in the inbox or requests count — an archived, deleted or muted chat must not light it. */
export function hasUnreadInInbox(conversations: readonly ConversationListFields[]): boolean {
  const { requests, inbox } = bucketConversations(conversations);
  return [...requests, ...inbox].some((conversation) => conversation.unreadCount > 0 && !conversation.mutedAt);
}

/** Mesajlar dock'unun rozeti (docs/history/328-*): okunmamış mesajı olan SOHBET sayısı (mesaj sayısı değil); başlıktaki noktayla aynı kapsam — gelen kutusu + istekler, sessize alınan/arşivlenen/silinen sayılmaz. */
export function unreadConversationCount(conversations: readonly ConversationListFields[]): number {
  const { requests, inbox } = bucketConversations(conversations);
  return [...requests, ...inbox].filter((conversation) => conversation.unreadCount > 0 && !conversation.mutedAt).length;
}

/** Sohbet listesi araması (Mesajlar sayfası + dock): grup adı / kişinin adı ve kullanıcı adı / son mesaj; büyük-küçük harf duyarsız, boş sorgu listeyi olduğu gibi verir. */
export function filterConversationsByQuery<
  T extends { group?: { name: string } | null; participants: readonly { displayName: string; username: string }[]; lastMessage: string },
>(conversations: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter((conversation) => {
    if (conversation.group) {
      const teamName = (conversation.group as { team?: { name: string } | null }).team?.name ?? "";
      return conversation.group.name.toLowerCase().includes(q) || teamName.toLowerCase().includes(q) || conversation.lastMessage.toLowerCase().includes(q);
    }
    const person = conversation.participants[0];
    return person?.displayName.toLowerCase().includes(q) || person?.username.toLowerCase().includes(q) || conversation.lastMessage.toLowerCase().includes(q);
  });
}

/** Ekip kanalı olan bir sohbetin alanları (`Conversation` ile uyumlu en küçük şekil). */
export interface TeamChannelFields extends ConversationListFields {
  id: string;
  lastMessage: string;
  group?: { team?: { id: string; channelName: string } | null } | null;
  teamRollup?: { channelCount: number; unreadChannelCount: number; channelName: string };
}

/**
 * Mesajlar listesinde bir ekibin kanallarını TEK satıra toplar (docs/history/353-*, Yön A mockup'ı): her kanal ayrı konuşmadır ama listede ekip başına
 * bir satır görünür. Temsilci kanal: okunmamışı olan en yeni kanal, yoksa en yeni kanal; satır onu açar. Sayaç tüm kanalların toplamıdır (sessize alınan
 * kanalın okunmamışı toplama girmez). Ekip olmayan sohbetler aynen kalır; sonuç gelen kutusu sırasındadır (sabitlenenler önce, sonra en yeni).
 */
export function rollUpTeamChannels<T extends TeamChannelFields>(conversations: readonly T[]): T[] {
  const byTeam = new Map<string, T[]>();
  const rest: T[] = [];
  for (const conversation of conversations) {
    const team = conversation.group?.team;
    if (!team) {
      rest.push(conversation);
      continue;
    }
    const list = byTeam.get(team.id) ?? [];
    list.push(conversation);
    byTeam.set(team.id, list);
  }
  const rolled: T[] = [];
  for (const channels of byTeam.values()) {
    const ordered = [...channels].sort(byNewest);
    const representative = ordered.find((channel) => channel.unreadCount > 0 && !channel.mutedAt) ?? ordered[0];
    const unread = channels.filter((channel) => channel.unreadCount > 0 && !channel.mutedAt);
    rolled.push({
      ...representative,
      unreadCount: unread.reduce((sum, channel) => sum + channel.unreadCount, 0),
      lastMessageAt: ordered[0].lastMessageAt,
      pinnedAt: channels.map((channel) => channel.pinnedAt ?? null).filter(Boolean).sort().at(-1) ?? null,
      mutedAt: channels.every((channel) => Boolean(channel.mutedAt)) ? (representative.mutedAt ?? null) : null,
      teamRollup: { channelCount: channels.length, unreadChannelCount: unread.length, channelName: representative.group?.team?.channelName ?? "" },
    });
  }
  return [...rest, ...rolled].sort(comparePinnedFirst);
}

/** Oldest message time the viewer may still see in a thread, or null when nothing was cleared. */
export function visibleAfter(clearedAt: string | null | undefined): number | null {
  if (!clearedAt) return null;
  const time = new Date(clearedAt).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Whether a message created at `createdAt` is still visible given the viewer's `clearedAt`. */
export function isAfterClear(createdAt: string, clearedAt: string | null | undefined): boolean {
  const limit = visibleAfter(clearedAt);
  return limit === null || new Date(createdAt).getTime() > limit;
}
