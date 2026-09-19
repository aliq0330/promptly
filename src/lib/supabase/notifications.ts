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
 * This user's real notifications, newest first. Real per Bölüm 19's RLS
 * (a user only ever sees their own), but nothing in the app writes to this
 * table yet — Bölüm 19 deliberately left no client insert policy (to stop
 * a user faking a notification "from" someone else), and no server-side
 * trigger produces one either. So this always resolves to an empty list
 * today; that's the honest, correct answer, not a bug — it becomes useful
 * the moment a future phase adds real notification generation.
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
