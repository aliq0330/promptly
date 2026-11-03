import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { isReactionKey, type ReactionKey } from "@/lib/reactions";
import { chunk } from "./paged";
import { fetchProfilesByIds } from "./chat-groups";
import type { NotificationCategoryName } from "@/lib/notification-mirror";
import type {
  AppNotification,
  NotificationCard,
  NotificationGroupMember,
  NotificationMute,
  NotificationPrefKey,
  NotificationType,
  UserProfile,
} from "@/types";

interface NotificationRow {
  id: string;
  type: NotificationType;
  message: string;
  target_href: string;
  is_read: boolean;
  created_at: string;
  reaction?: string | null;
  actor: ProfileRow | null;
}

const NOTIFICATION_SELECT = `
  id, type, message, target_href, is_read, created_at, reaction,
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
    reaction: row.reaction && isReactionKey(row.reaction) ? row.reaction : null,
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

/**
 * Haftalık özet bildirimi (docs/history/307-*): uygulama açılışında bir kez çağrılır; sunucu haftada en çok bir bildirim üretir (hareket yoksa hiç).
 * Dönüş: yeni bildirim oluştu mu. Hata (ör. migration henüz uygulanmadı) bildirimleri etkilemez.
 */
export async function dispatchMyWeeklyDigest(): Promise<number> {
  const { data, error } = await supabase.rpc("dispatch_my_weekly_digest");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

// ============================================================================================================================================
// Bildirim merkezi (docs/history/326-*): gruplu kartlar, sessize alma, erteleme, tür tercihi. Gruplama SUNUCUDADIR (`notifications_grouped_page`).
// ============================================================================================================================================

/** Bir istekte gelen kart sayısı (sunucu en çok 100 verir). */
export const NOTIFICATION_CARDS_PAGE = 30;

/** Kartların keyset imleci: son kartın zamanı + anahtarı. */
export interface NotificationCardCursor {
  at: string;
  key: string;
}

export interface NotificationCardsQuery {
  category?: NotificationCategoryName | null;
  unreadOnly?: boolean;
  snoozedOnly?: boolean;
}

interface GroupedRow {
  group_key: string;
  type: NotificationType;
  target_href: string;
  sort_at: string;
  row_count: number;
  unread_count: number;
  latest_id: string;
  latest_message: string;
  latest_actor_id: string | null;
  actor_ids: string[] | null;
  reaction_counts: Record<string, number> | null;
}

async function profilesById(ids: string[]): Promise<Map<string, UserProfile>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, UserProfile>();
  const pages = await Promise.all(chunk(unique, 100).map((part) => fetchProfilesByIds(part)));
  for (const profile of pages.flat()) map.set(profile.id, profile);
  return map;
}

function mapReactionCounts(raw: Record<string, number> | null): NotificationCard["reactionCounts"] {
  const counts: NotificationCard["reactionCounts"] = {};
  for (const [key, n] of Object.entries(raw ?? {})) if (isReactionKey(key) && n > 0) counts[key] = n;
  return counts;
}

/** Gruplu kartların bir sayfası (en yeni önce). Hata fırlatır: başarısız "daha fazla" "bitti" gibi görünmesin. */
export async function fetchNotificationCardsPage(
  cursor: NotificationCardCursor | null,
  limit = NOTIFICATION_CARDS_PAGE,
  query: NotificationCardsQuery = {},
): Promise<NotificationCard[]> {
  const { data, error } = await supabase.rpc("notifications_grouped_page", {
    p_limit: limit,
    p_before_at: cursor?.at ?? null,
    p_before_key: cursor?.key ?? null,
    p_category: query.category ?? null,
    p_unread_only: Boolean(query.unreadOnly),
    p_snoozed_only: Boolean(query.snoozedOnly),
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GroupedRow[];
  const profiles = await profilesById(rows.flatMap((row) => [...(row.actor_ids ?? []), ...(row.latest_actor_id ? [row.latest_actor_id] : [])]));
  return rows.map((row) => ({
    key: row.group_key,
    type: row.type,
    targetHref: row.target_href,
    sortAt: row.sort_at,
    rowCount: row.row_count,
    unreadCount: row.unread_count,
    latestId: row.latest_id,
    latestMessage: row.latest_message,
    latestActor: row.latest_actor_id ? (profiles.get(row.latest_actor_id) ?? null) : null,
    actors: (row.actor_ids ?? []).flatMap((id) => {
      const profile = profiles.get(id);
      return profile ? [profile] : [];
    }),
    reactionCounts: mapReactionCounts(row.reaction_counts),
  }));
}

/** Zil rozeti: okunmamış satırı olan kart sayısı; `null` = okunamadı. */
export async function fetchUnreadCardCount(): Promise<number | null> {
  const { data, error } = await supabase.rpc("notifications_unread_group_count");
  if (error) {
    console.error("fetchUnreadCardCount", error);
    return null;
  }
  return typeof data === "number" ? data : 0;
}

/** Kategori menüsündeki okunmamış kart sayıları (`all` dahil değildir: çağıran toplar). */
export async function fetchUnreadCountsByCategory(): Promise<Partial<Record<NotificationCategoryName, number>>> {
  const { data, error } = await supabase.rpc("notifications_unread_by_category");
  if (error) {
    console.error("fetchUnreadCountsByCategory", error);
    return {};
  }
  const out: Partial<Record<NotificationCategoryName, number>> = {};
  for (const row of (data ?? []) as { category: NotificationCategoryName; n: number }[]) out[row.category] = row.n;
  return out;
}

/** Ertelenen kart sayısı + en yakın uyanma anı (istemci bir zamanlayıcı kurar). */
export async function fetchSnoozeSummary(): Promise<{ groups: number; nextWake: string | null }> {
  const { data, error } = await supabase.rpc("notifications_snooze_summary");
  if (error) {
    console.error("fetchSnoozeSummary", error);
    return { groups: 0, nextWake: null };
  }
  const row = ((data ?? []) as { snoozed_groups: number; next_wake: string | null }[])[0];
  return { groups: row?.snoozed_groups ?? 0, nextWake: row?.next_wake ?? null };
}

/** Bir kartın üyeleri (Ayrıntı): en yeni önce, (created_at, id) keyset. */
export async function fetchNotificationGroupMembers(
  key: string,
  cursor: { at: string; id: string } | null,
  limit = 30,
): Promise<NotificationGroupMember[]> {
  const { data, error } = await supabase.rpc("notifications_group_members", {
    p_key: key,
    p_limit: limit,
    p_before_at: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; actor_id: string | null; reaction: string | null; is_read: boolean; created_at: string; message: string }[];
  const profiles = await profilesById(rows.flatMap((row) => (row.actor_id ? [row.actor_id] : [])));
  return rows.map((row) => ({
    id: row.id,
    actor: row.actor_id ? (profiles.get(row.actor_id) ?? null) : null,
    reaction: row.reaction && isReactionKey(row.reaction) ? (row.reaction as ReactionKey) : null,
    isRead: row.is_read,
    createdAt: row.created_at,
    message: row.message,
  }));
}

async function groupRpc(name: string, params: Record<string, unknown>): Promise<number> {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : 0;
}

export const markCardRead = (key: string) => groupRpc("notifications_group_mark_read", { p_key: key });
export const markCardUnread = (key: string) => groupRpc("notifications_group_mark_unread", { p_key: key });
export const deleteCard = (key: string) => groupRpc("notifications_group_delete", { p_key: key });
export const snoozeCard = (key: string, until: Date) => groupRpc("notifications_group_snooze", { p_key: key, p_until: until.toISOString() });
export const unsnoozeCard = (key: string) => groupRpc("notifications_group_unsnooze", { p_key: key });

/** Sessize alma: tablo istemciye kapalı, yazma yalnız RPC (docs/history/326-*). */
export async function setNotificationMute(kind: "actor" | "content", target: string, label: string, on: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_notification_mute", { p_kind: kind, p_target: target, p_label: label, p_on: on });
  if (error) throw new Error(error.message);
}

export async function fetchNotificationMutes(): Promise<NotificationMute[]> {
  const { data, error } = await supabase.from("notification_mutes").select("kind, target, label, created_at").order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { kind: "actor" | "content"; target: string; label: string; created_at: string }[]).map((row) => ({
    kind: row.kind,
    target: row.target,
    label: row.label,
    createdAt: row.created_at,
  }));
}

/** Kapatılan tür anahtarları (satırı olmayan tür AÇIKTIR). */
export async function fetchDisabledNotificationPrefs(): Promise<NotificationPrefKey[]> {
  const { data, error } = await supabase.from("notification_type_prefs").select("pref_key").eq("enabled", false);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { pref_key: NotificationPrefKey }[]).map((row) => row.pref_key);
}

export async function setNotificationTypePref(key: NotificationPrefKey, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_notification_type_pref", { p_key: key, p_enabled: enabled });
  if (error) throw new Error(error.message);
}
