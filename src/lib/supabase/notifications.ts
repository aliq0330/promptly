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

/** Notifications per request (the list grows with "Daha fazla"; the bell's number is counted separately, see `fetchUnreadNotificationCount`). */
export const NOTIFICATIONS_PAGE = 60;

function mapNotificationRow(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    actor: row.actor ? mapProfileRow(row.actor) : null,
    message: row.message,
    targetHref: row.target_href,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

/**
 * One slice of this user's real notifications, newest first: rows `[offset, offset + limit)`. RLS (Bölüm 19) already
 * limits this to the caller's own rows; a series of `SECURITY DEFINER` triggers (Bölüm 19, 20260919150000, 20260919160000,
 * 20260919180000) populate this table for likes/comments/replies/request responses/follows/messages. Reading ALL of them at once stopped at
 * PostgREST's 1000 rows and loaded every actor profile on each sign-in and each realtime event. Throws on failure (a failed "more" must not
 * look like "no more").
 */
export async function fetchNotificationsPage(userId: string, offset = 0, limit = NOTIFICATIONS_PAGE): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as NotificationRow[]).map(mapNotificationRow);
}

/** The first `limit` notifications (default one page); a failed read is an empty list so the bell never breaks the page. */
export async function fetchNotificationsForUser(userId: string, limit = NOTIFICATIONS_PAGE): Promise<AppNotification[]> {
  try {
    return await fetchNotificationsPage(userId, 0, limit);
  } catch (err) {
    console.error("fetchNotificationsForUser", err);
    return [];
  }
}

/** How many of the caller's notifications are unread — counted by the database, so the bell is right however few rows are loaded. `null` when it failed. */
export async function fetchUnreadNotificationCount(userId: string): Promise<number | null> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", userId).eq("is_read", false);
  if (error) {
    console.error("fetchUnreadNotificationCount", error);
    return null;
  }
  return count ?? 0;
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

/** "Tümünü sil" — kullanıcının KENDİ tüm bildirimlerini tek DELETE ile siler (RLS: yalnız alıcı kendi satırlarını silebilir). */
export async function deleteAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("recipient_id", userId);
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
