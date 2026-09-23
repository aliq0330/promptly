import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import type { AppNotification, NotificationType } from "@/types";

interface NotificationRow {
  id: string;
  type: NotificationType;
  message: string;
  target_href: string;
  is_read: boolean;
  created_at: string;
  actor: ProfileRow | null;
}

const NOTIFICATION_SELECT = `
  id, type, message, target_href, is_read, created_at,
  actor:actor_id ( id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests )
`;

/**
 * This user's real notifications, newest first. RLS (Bölüm 19) already
 * limits this to the caller's own rows; a series of `SECURITY DEFINER`
 * triggers (Bölüm 19, 20260919150000, 20260919160000, 20260919180000) now
 * actually populate this table for likes/comments/replies/request
 * responses/follows/messages, so this resolves to real data once any of
 * those events happen to the signed-in user.
 */
export async function fetchNotificationsForUser(userId: string): Promise<AppNotification[]> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select(NOTIFICATION_SELECT)
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("fetchNotificationsForUser", error);
      return [];
    }
    return ((data ?? []) as unknown as NotificationRow[]).map((row) => ({
      id: row.id,
      type: row.type,
      actor: row.actor ? mapProfileRow(row.actor) : null,
      message: row.message,
      targetHref: row.target_href,
      isRead: row.is_read,
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error("fetchNotificationsForUser", err);
    return [];
  }
}

/**
 * Marks one of the CALLER's OWN notifications read. Recipient ownership is
 * enforced server-side by RLS (`auth.uid() = recipient_id`), not just by
 * this `userId` filter — a client-supplied id alone proves nothing, so a
 * mismatched id here simply matches zero rows rather than affecting
 * someone else's notification.
 */
export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("recipient_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * Deletes one of the CALLER's OWN notifications. Same RLS-backed ownership
 * guarantee as `markNotificationRead`. This only ever removes the
 * notification row itself — it has no path to the underlying like/comment/
 * follow/message it was about.
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("recipient_id", userId);
  if (error) throw new Error(error.message);
}

/**
 * "Tümünü okundu işaretle" — one bulk UPDATE rather than one round-trip per
 * unread row. Same RLS-backed ownership guarantee as the two functions
 * above; only ever touches rows already unread, so it's safe to call even
 * with nothing unread.
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
}
