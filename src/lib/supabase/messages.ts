import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { Conversation, Message, UserProfile } from "@/types";

interface MembershipRow {
  conversation_id: string;
  unread_count: number;
  conversations: { id: string; last_message_at: string | null } | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  shared_prompt_id: string | null;
  shared_request_id: string | null;
  reply_to_message_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

const MESSAGE_SELECT =
  "id, conversation_id, sender_id, body, shared_prompt_id, shared_request_id, reply_to_message_id, edited_at, deleted_at, created_at";

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    sharedPromptId: row.shared_prompt_id,
    sharedRequestId: row.shared_request_id,
    replyToMessageId: row.reply_to_message_id,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}

interface PreviewRow {
  body: string | null;
  shared_prompt_id: string | null;
  shared_request_id: string | null;
  deleted_at: string | null;
  created_at: string;
}

/** Renders a conversation list's one-line preview for the most recent message, honoring shared content/deletion the same way the thread itself does. */
function previewTextFor(row: PreviewRow | undefined): string {
  if (!row) return "Henüz mesaj yok.";
  if (row.deleted_at) return "Bu mesaj silindi.";
  if (row.body) return row.body;
  if (row.shared_prompt_id) return "Bir prompt paylaştı.";
  if (row.shared_request_id) return "Bir prompt isteği paylaştı.";
  return "Henüz mesaj yok.";
}

/**
 * Every real conversation the given user is a member of, newest-first —
 * genuinely real, cross-device DMs (CLAUDE.md Bölüm 21 Faz 6), unlike the
 * rest of the app's mock+localStorage messaging (Bölüm 16). `conversations`
 * has no stored message preview, so the last message body is fetched
 * separately and matched up in JS.
 */
export async function fetchConversationsForUser(userId: string): Promise<Conversation[]> {
  try {
    const { data: memberships, error } = await supabase
      .from("conversation_members")
      .select("conversation_id, unread_count, conversations(id, last_message_at)")
      .eq("user_id", userId);
    if (error || !memberships || memberships.length === 0) return [];

    const conversationIds = (memberships as unknown as MembershipRow[]).map((m) => m.conversation_id);

    const { data: otherMembers } = await supabase
      .from("conversation_members")
      .select(
        "conversation_id, profiles(id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests)",
      )
      .in("conversation_id", conversationIds)
      .neq("user_id", userId);

    const { data: recentMessages } = await supabase
      .from("messages")
      .select("conversation_id, body, shared_prompt_id, shared_request_id, deleted_at, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    const lastMessageByConversation = new Map<string, PreviewRow>();
    for (const msg of (recentMessages ?? []) as (PreviewRow & { conversation_id: string })[]) {
      if (!lastMessageByConversation.has(msg.conversation_id)) {
        lastMessageByConversation.set(msg.conversation_id, msg);
      }
    }

    const otherByConversation = new Map<string, ProfileRow>();
    for (const row of (otherMembers ?? []) as unknown as { conversation_id: string; profiles: ProfileRow | null }[]) {
      if (row.profiles) otherByConversation.set(row.conversation_id, row.profiles);
    }

    return (memberships as unknown as MembershipRow[])
      .map((m): Conversation | null => {
        const otherProfile = otherByConversation.get(m.conversation_id);
        if (!otherProfile) return null; // no other member found — shouldn't happen for a real 1:1 thread
        const last = lastMessageByConversation.get(m.conversation_id);
        return {
          id: m.conversation_id,
          participants: [mapProfileRow(otherProfile)],
          lastMessage: previewTextFor(last),
          lastMessageAt: m.conversations?.last_message_at ?? last?.created_at ?? new Date(0).toISOString(),
          unreadCount: m.unread_count,
        };
      })
      .filter((c): c is Conversation => Boolean(c))
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
  } catch (err) {
    console.error("fetchConversationsForUser", err);
    return [];
  }
}

/**
 * A single real conversation, from this member's point of view — for a
 * direct link that fell outside the recent-conversations batch above.
 * Returns null both when the conversation doesn't exist and when this user
 * isn't a member of it (RLS hides the row either way) — indistinguishable
 * on purpose, same as every other "not found" in this app.
 */
export async function fetchConversationForUser(conversationId: string, userId: string): Promise<Conversation | null> {
  try {
    const { data: membership, error } = await supabase
      .from("conversation_members")
      .select("conversation_id, unread_count, conversations(id, last_message_at)")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !membership) return null;

    const { data: otherMember } = await supabase
      .from("conversation_members")
      .select(
        "profiles(id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests)",
      )
      .eq("conversation_id", conversationId)
      .neq("user_id", userId)
      .maybeSingle();
    const otherProfile = (otherMember as unknown as { profiles: ProfileRow | null } | null)?.profiles;
    if (!otherProfile) return null;

    const { data: last } = await supabase
      .from("messages")
      .select("body, shared_prompt_id, shared_request_id, deleted_at, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = membership as unknown as MembershipRow;
    return {
      id: conversationId,
      participants: [mapProfileRow(otherProfile)],
      lastMessage: previewTextFor(last ?? undefined),
      lastMessageAt: row.conversations?.last_message_at ?? last?.created_at ?? new Date(0).toISOString(),
      unreadCount: row.unread_count,
    };
  } catch (err) {
    console.error("fetchConversationForUser", err);
    return null;
  }
}

/**
 * Every message in a real conversation, oldest-first, minus any this user
 * hid "for themselves" (`message_hidden_for` — Bölüm 21 Faz A). RLS
 * (Bölüm 19) already restricts the base query to conversation members.
 */
export async function fetchMessages(conversationId: string, viewerId: string): Promise<Message[]> {
  try {
    const [{ data, error }, { data: hidden }] = await Promise.all([
      supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true }),
      supabase.from("message_hidden_for").select("message_id").eq("user_id", viewerId),
    ]);
    if (error) return [];
    const hiddenIds = new Set((hidden ?? []).map((row) => row.message_id as string));
    return (data ?? [])
      .map((row) => mapMessageRow(row as MessageRow))
      .filter((message) => !hiddenIds.has(message.id));
  } catch (err) {
    console.error("fetchMessages", err);
    return [];
  }
}

export interface SendMessageInput {
  body?: string;
  sharedPromptId?: string;
  sharedRequestId?: string;
  replyToMessageId?: string;
}

/** Genuinely, permanently sends a message — plain text, a shared prompt/request (with an optional caption), or a reply. Bölüm 19's handle_new_message trigger updates conversations.last_message_at and every other member's unread_count; the messages_has_content CHECK (Faz A) rejects a completely empty send at the database level. */
export async function sendMessage(conversationId: string, senderId: string, input: SendMessageInput): Promise<Message> {
  const trimmed = input.body?.trim();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: trimmed || null,
      shared_prompt_id: input.sharedPromptId ?? null,
      shared_request_id: input.sharedRequestId ?? null,
      reply_to_message_id: input.replyToMessageId ?? null,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Mesaj gönderilemedi.");
  return mapMessageRow(data as MessageRow);
}

/** Edits the caller's own message body — RLS (Faz A) only allows the sender, within 15 minutes of sending; `handle_message_body_edit` stamps edited_at automatically. */
export async function editMessage(messageId: string, senderId: string, body: string): Promise<Message> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Boş mesaj gönderilemez.");
  const { data, error } = await supabase
    .from("messages")
    .update({ body: trimmed })
    .eq("id", messageId)
    .eq("sender_id", senderId)
    .select(MESSAGE_SELECT)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bu mesaj artık düzenlenemez (15 dakikalık süre dolmuş olabilir).");
  return mapMessageRow(data as MessageRow);
}

/** "Herkesten sil" — clears the message's content for every member of the conversation. Same RLS window as editing (Faz A). */
export async function deleteMessageForEveryone(messageId: string, senderId: string): Promise<void> {
  const { data, error } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString(), body: null, shared_prompt_id: null, shared_request_id: null })
    .eq("id", messageId)
    .eq("sender_id", senderId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bu mesaj artık silinemez (15 dakikalık süre dolmuş olabilir).");
}

/** "Benden sil" — hides a message from only this viewer's own thread view; never touches the row itself or other members' view of it. */
export async function hideMessageForMe(messageId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("message_hidden_for").insert({ message_id: messageId, user_id: userId });
  if (error) throw new Error(error.message);
}

/** Marks a real conversation as read for one member — best-effort, a failure here shouldn't block viewing messages. */
export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  try {
    await supabase
      .from("conversation_members")
      .update({ unread_count: 0 })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
  } catch (err) {
    console.error("markConversationRead", err);
  }
}

async function findDirectConversationId(userId: string, otherUserId: string): Promise<string | null> {
  const { data: mine, error } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId);
  if (error || !mine || mine.length === 0) return null;
  const ids = mine.map((row) => row.conversation_id as string);
  const { data: shared } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", otherUserId)
    .in("conversation_id", ids);
  return (shared?.[0]?.conversation_id as string | undefined) ?? null;
}

/**
 * Finds an existing real 1:1 conversation between these two real users, or
 * creates a new one — the entry point for a real profile's "Mesaj Gönder"
 * button (CLAUDE.md Bölüm 21 Faz 6).
 *
 * The new conversation's id is generated CLIENT-SIDE (`crypto.randomUUID()`)
 * instead of letting Postgres's `gen_random_uuid()` default assign it and
 * reading it back with `.insert({}).select().single()` — that read-back is
 * a real bug that shipped in the first version of this function: the
 * `conversations` SELECT policy is `is_conversation_member(id)`, and at the
 * moment of the INSERT no membership row exists yet (that's the next two
 * statements), so the `RETURNING` clause has nothing it's allowed to show
 * and `.single()` throws — the insert itself actually succeeds, but the
 * caller never finds out the new conversation's id, so "Mesaj Gönder"
 * silently did nothing. Knowing the id upfront sidesteps this chicken-and-
 * egg RLS problem entirely; nothing needs to be read back afterward.
 *
 * The two membership rows are still inserted as two separate statements,
 * not one multi-row insert: the membership RLS policy's `WITH CHECK` for
 * the *other* user's row relies on `is_conversation_member()` already
 * seeing this session's own row, and a single multi-row INSERT doesn't
 * guarantee that visibility across its own rows the way two sequential
 * statements do.
 */
export async function getOrCreateDirectConversation(
  userId: string,
  otherUserId: string,
  otherProfile: UserProfile,
): Promise<Conversation> {
  const existingId = await findDirectConversationId(userId, otherUserId);
  if (existingId) {
    const found = await fetchConversationForUser(existingId, userId);
    if (found) return found;
  }

  const conversationId = crypto.randomUUID();
  const { error: conversationError } = await supabase.from("conversations").insert({ id: conversationId });
  if (conversationError) {
    throw new Error(conversationError.message);
  }

  try {
    const { error: selfError } = await supabase
      .from("conversation_members")
      .insert({ conversation_id: conversationId, user_id: userId });
    if (selfError) throw new Error(selfError.message);

    const { error: otherError } = await supabase
      .from("conversation_members")
      .insert({ conversation_id: conversationId, user_id: otherUserId });
    if (otherError) throw new Error(otherError.message);
  } catch (err) {
    // Best-effort — there's no DELETE policy on `conversations`, so this
    // won't actually remove the orphaned row, but it's harmless to try and
    // costs nothing if it no-ops.
    await supabase.from("conversations").delete().eq("id", conversationId);
    throw err instanceof Error ? err : new Error("Konuşma oluşturulamadı.");
  }

  return {
    id: conversationId,
    participants: [otherProfile],
    lastMessage: "Henüz mesaj yok.",
    lastMessageAt: new Date().toISOString(),
    unreadCount: 0,
  };
}
