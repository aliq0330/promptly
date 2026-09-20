import { supabase } from "./client";

export interface MessageReactionRow {
  messageId: string;
  userId: string;
  emoji: string;
}

interface RawReactionRow {
  message_id: string;
  user_id: string;
  emoji: string;
}

/**
 * All reactions across an entire real conversation, one query — not a
 * per-message fetch (this app's own documented N+1 lesson, see CLAUDE.md
 * Bölüm 21 Faz 3's "known issue"; there's no reason to repeat it here when
 * a single `conversation_id` filter already gets every reaction in the
 * thread at once). RLS (20260919240000) already restricts this to a real
 * member of the conversation.
 */
export async function fetchReactionsForConversation(conversationId: string): Promise<MessageReactionRow[]> {
  try {
    const { data, error } = await supabase
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .eq("conversation_id", conversationId);
    if (error || !data) return [];
    return (data as RawReactionRow[]).map((row) => ({
      messageId: row.message_id,
      userId: row.user_id,
      emoji: row.emoji,
    }));
  } catch (err) {
    console.error("fetchReactionsForConversation", err);
    return [];
  }
}

/**
 * Sets (adds or changes) the caller's own reaction on a message —
 * genuinely one upsert on the table's own primary key
 * `(message_id, user_id)`, so this is atomic: a user can never end up
 * with two active reactions on the same message, and a race between two
 * rapid taps just applies in order rather than creating duplicates.
 */
export async function setMessageReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string,
): Promise<void> {
  const { error } = await supabase
    .from("message_reactions")
    .upsert(
      { message_id: messageId, conversation_id: conversationId, user_id: userId, emoji, created_at: new Date().toISOString() },
      { onConflict: "message_id,user_id" },
    );
  if (error) throw new Error(error.message);
}

/** Removes the caller's own reaction from a message (tapping the same emoji again). RLS only allows a user to delete their own row. */
export async function removeMessageReaction(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
