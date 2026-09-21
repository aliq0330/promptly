import type { Message } from "@/types";
import type { MessageReactionRow } from "@/lib/supabase/message-reactions";

/**
 * Pure merge logic for a Realtime `INSERT` on `messages`, kept separate
 * from the subscription wiring itself so it can be unit-tested directly
 * (this sandbox's network policy blocks WebSocket traffic to a real
 * Supabase project — see CLAUDE.md Bölüm 21 Faz 6/9.8/9.9 — so a live
 * end-to-end Realtime test has never been possible here; this is what
 * makes the actual merge behavior verifiable without one).
 *
 * De-dupes by id: the sender's own optimistic append (`handleSubmit` in
 * `local-conversation-view.tsx`) and the Realtime echo of that same INSERT
 * (delivered back to the sender too, since they're a conversation member)
 * would otherwise show the same message twice.
 */
export function mergeIncomingMessage(current: Message[], incoming: Message): Message[] {
  if (current.some((message) => message.id === incoming.id)) return current;
  return [...current, incoming];
}

/**
 * Pure merge logic for a Realtime `UPDATE` on `messages` (an edit, or a
 * "herkesten sil" soft-delete — both are UPDATEs, see Bölüm 9.8). Replaces
 * the matching message in place; a row that isn't loaded yet (shouldn't
 * happen for an open thread, since UPDATE never precedes its own INSERT)
 * is a no-op rather than an error.
 */
export function applyMessageUpdate(current: Message[], updated: Message): Message[] {
  return current.map((message) => (message.id === updated.id ? updated : message));
}

/**
 * Pure merge logic for a Realtime INSERT/UPDATE on `message_reactions`
 * (Aşama 2/6 — a reaction being added or its emoji changed, both land here
 * since a change is an UPDATE on the same `(message_id, user_id)` row, see
 * the migration's upsert). Same replace-or-append shape as
 * `mergeIncomingMessage`/`applyMessageUpdate` above, keyed by the table's
 * own composite primary key instead of a single `id`.
 */
export function upsertReaction(current: MessageReactionRow[], incoming: MessageReactionRow): MessageReactionRow[] {
  const index = current.findIndex((r) => r.messageId === incoming.messageId && r.userId === incoming.userId);
  if (index === -1) return [...current, incoming];
  const next = current.slice();
  next[index] = incoming;
  return next;
}

/** Pure merge logic for a Realtime DELETE on `message_reactions` (a reaction removed — tapping the same emoji again). */
export function removeReactionRow(current: MessageReactionRow[], messageId: string, userId: string): MessageReactionRow[] {
  return current.filter((r) => !(r.messageId === messageId && r.userId === userId));
}
