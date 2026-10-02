import { supabase } from "./client";
import { getBlockedIds } from "./blocked-users";
import type { UserProfile } from "@/types";

/** The four first-class content types (CLAUDE.md Bölüm 1/9.59/9.60). */
export type StatisticsContentType = "prompt" | "request" | "generator" | "workflow";
export type StatisticsKind = "likes" | "comments" | "saves";

export interface ContentEngager {
  /** Stable list key (the actor's id — one row per user per kind). */
  key: string;
  /** `null` when the account/public profile no longer exists — rendered as "Silinmiş kullanıcı". */
  user: UserProfile | null;
  interactedAt: string;
  /** Only for `comments`: that user's most recent, non-deleted comment on this post. */
  commentBody: string | null;
}

export interface EngagersCursor {
  at: string;
  actorId: string;
}

export interface EngagersPage {
  items: ContentEngager[];
  /** `null` = no further page. */
  nextCursor: EngagersCursor | null;
}

export const ENGAGERS_PAGE_SIZE = 20;

interface EngagerRow {
  actor_id: string;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_avatar_url: string | null;
  actor_follower_count: number | null;
  interacted_at: string;
  comment_id: string | null;
  comment_body: string | null;
}

/**
 * One page of the people who liked / commented on / saved a post, newest
 * interaction first (`content_engagers` RPC, migration
 * `20260919550000_content_statistics.sql`). Only public profile fields come
 * back — never email/auth data. Keyset-paginated: pass the previous page's
 * `nextCursor`. Users the viewer has blocked are filtered out client-side
 * AFTER the cursor is computed from the raw rows, so a page full of blocked
 * users can't be mistaken for "no more results". Throws on a real RPC
 * error so the modal can show a retry state instead of a fake empty list.
 */
export async function fetchContentEngagers(
  contentType: StatisticsContentType,
  contentId: string,
  kind: StatisticsKind,
  cursor?: EngagersCursor | null,
): Promise<EngagersPage> {
  const { data, error } = await supabase.rpc("content_engagers", {
    p_content_type: contentType,
    p_content_id: contentId,
    p_kind: kind,
    // One extra row tells us whether another page exists without a count query.
    p_limit: ENGAGERS_PAGE_SIZE + 1,
    p_before_at: cursor?.at ?? null,
    p_before_actor: cursor?.actorId ?? null,
  });
  if (error) throw error;

  const rows = (data ?? []) as EngagerRow[];
  const hasMore = rows.length > ENGAGERS_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, ENGAGERS_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];
  const nextCursor: EngagersCursor | null = hasMore && last ? { at: last.interacted_at, actorId: last.actor_id } : null;

  const blocked = await getBlockedIds();
  const items = pageRows
    .filter((row) => !blocked.has(row.actor_id))
    .map<ContentEngager>((row) => ({
      key: row.actor_id,
      user:
        row.actor_username && row.actor_display_name
          ? {
              id: row.actor_id,
              username: row.actor_username,
              displayName: row.actor_display_name,
              avatarUrl: row.actor_avatar_url,
              coverUrl: null,
              bio: null,
              website: null,
              followerCount: row.actor_follower_count ?? 0,
              followingCount: 0,
              createdAt: row.interacted_at,
            }
          : null,
      interactedAt: row.interacted_at,
      commentBody: row.comment_body,
    }));

  return { items, nextCursor };
}
