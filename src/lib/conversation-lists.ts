/**
 * Pure rules for which of the viewer's own conversations show where. Archive,
 * "delete from my list" and "clear history" are per-member state on the
 * viewer's own membership row (`archived_at` / `deleted_at` / `cleared_at`),
 * so every list is derived from the same set of rows the viewer already has —
 * no second store.
 */

export interface ConversationListFields {
  myStatus: "accepted" | "pending";
  archivedAt: string | null;
  deletedAt: string | null;
  unreadCount: number;
  lastMessageAt: string;
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
  return { requests: requests.sort(byNewest), inbox: inbox.sort(byNewest), archived: archived.sort(byNewest) };
}

/** The header's unread dot: only chats that are actually listed in the inbox or requests count — an archived or deleted chat must not light it. */
export function hasUnreadInInbox(conversations: readonly ConversationListFields[]): boolean {
  const { requests, inbox } = bucketConversations(conversations);
  return [...requests, ...inbox].some((conversation) => conversation.unreadCount > 0);
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
