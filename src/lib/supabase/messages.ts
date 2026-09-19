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
  body: string;
  created_at: string;
}

function mapMessageRow(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    createdAt: row.created_at,
  };
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
      .select("conversation_id, body, created_at")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false });

    const lastMessageByConversation = new Map<string, { body: string; created_at: string }>();
    for (const msg of (recentMessages ?? []) as { conversation_id: string; body: string; created_at: string }[]) {
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
          lastMessage: last?.body ?? "Henüz mesaj yok.",
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
      .select("body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const row = membership as unknown as MembershipRow;
    return {
      id: conversationId,
      participants: [mapProfileRow(otherProfile)],
      lastMessage: last?.body ?? "Henüz mesaj yok.",
      lastMessageAt: row.conversations?.last_message_at ?? last?.created_at ?? new Date(0).toISOString(),
      unreadCount: row.unread_count,
    };
  } catch (err) {
    console.error("fetchConversationForUser", err);
    return null;
  }
}

/** Every message in a real conversation, oldest-first. RLS (Bölüm 19) already restricts this to conversation members. */
export async function fetchMessages(conversationId: string): Promise<Message[]> {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map((row) => mapMessageRow(row as MessageRow));
  } catch (err) {
    console.error("fetchMessages", err);
    return [];
  }
}

/** Genuinely, permanently sends a message. Bölüm 19's handle_new_message trigger updates conversations.last_message_at and every other member's unread_count. */
export async function sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Mesaj gönderilemedi.");
  return mapMessageRow(data as MessageRow);
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
 * button (CLAUDE.md Bölüm 21 Faz 6). The two membership rows are inserted
 * as two separate statements on purpose, not one multi-row insert: the
 * membership RLS policy's `WITH CHECK` for the *other* user's row relies on
 * `is_conversation_member()` already seeing this session's own row, and a
 * single multi-row INSERT doesn't guarantee that visibility across its own
 * rows the way two sequential statements do.
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

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({})
    .select("id, last_message_at")
    .single();
  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? "Konuşma oluşturulamadı.");
  }
  const conversationId = conversation.id as string;

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
    await supabase.from("conversations").delete().eq("id", conversationId);
    throw err instanceof Error ? err : new Error("Konuşma oluşturulamadı.");
  }

  return {
    id: conversationId,
    participants: [otherProfile],
    lastMessage: "Henüz mesaj yok.",
    lastMessageAt: conversation.last_message_at ?? new Date().toISOString(),
    unreadCount: 0,
  };
}
