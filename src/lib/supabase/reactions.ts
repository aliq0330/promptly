import { supabase } from "./client";
import { getBlockedIds } from "./blocked-users";
import { valueBatcherRegistry } from "./batched-lookup";
import { chunk, type PagedResult } from "./paged";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROFILE_SELECT } from "./profiles";
import { countsFromRows, isReactionKey, DEFAULT_REACTION, type ReactionCounts, type ReactionFriend, type ReactionKey } from "@/lib/reactions";
import type { LikeableContentType } from "./likes";
import { likeTargetColumn } from "./likes";
import type { UserProfile } from "@/types";

/*
 * Tepkiler (docs/history/265-*): `prompt_likes.reaction` (bir beğeni = bir tepki), hedef başına sayılar `reaction_stats`'ta
 * (tetikleyiciyle tutulur; okuma hedefin beğenilerini okuyabilene açıktır), "takip ettiklerimden kim" `reaction_friends` RPC'si.
 * Hepsi RLS'ten geçer; okunamayan hedef boş döner. Sütun/tablo henüz yoksa (migration uygulanmadan) okumalar boş/varsayılan döner —
 * beğeni davranışı bozulmaz.
 */

/** `reaction_friends` bir çağrıda en çok bu kadar hedef alır (SQL tarafı da keser). */
const FRIENDS_BATCH = 60;

const myReactionLookup = valueBatcherRegistry<ReactionKey>((key) => {
  const [userId, contentType] = key.split("|") as [string, LikeableContentType];
  const column = likeTargetColumn(contentType);
  return async (ids) => {
    const { data, error } = await supabase.from("prompt_likes").select(`${column}, reaction`).eq("user_id", userId).in(column, ids);
    const found = new Map<string, ReactionKey>();
    if (error || !data) return found;
    for (const row of data as unknown as Record<string, string | null>[]) {
      const id = row[column];
      // `reaction` sütunu yoksa (migration öncesi) seçimden düşer: bu, eski bir "love" beğenisidir.
      if (id) found.set(id, isReactionKey(row.reaction) ? row.reaction : DEFAULT_REACTION);
    }
    return found;
  };
});

/** The viewer's own reaction on this target, `null` when they have none. Concurrent calls (one per card) are batched into one query. */
export async function fetchMyReaction(id: string, userId: string, contentType: LikeableContentType = "prompt"): Promise<ReactionKey | null> {
  return (await myReactionLookup(`${userId}|${contentType}`)(id)) ?? null;
}

const countsLookup = valueBatcherRegistry<ReactionCounts>(() => async (ids) => {
  const { data, error } = await supabase.from("reaction_stats").select("target_id, reaction, n").in("target_id", ids);
  const found = new Map<string, ReactionCounts>();
  if (error || !data) return found;
  const grouped = new Map<string, { reaction: string; n: number }[]>();
  for (const row of data as { target_id: string; reaction: string; n: number }[]) {
    const list = grouped.get(row.target_id) ?? [];
    list.push(row);
    grouped.set(row.target_id, list);
  }
  for (const [id, rows] of grouped) found.set(id, countsFromRows(rows));
  return found;
});

/** Per-reaction counts of a target (all zero when nobody reacted or the table is not there yet). Batched across the cards of a page. */
export async function fetchReactionCounts(id: string): Promise<ReactionCounts | undefined> {
  return countsLookup("all")(id);
}

interface FriendRow {
  target_id: string;
  user_id: string;
  reaction: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

const friendsLookup = valueBatcherRegistry<ReactionFriend[]>(
  () => async (ids) => {
    const found = new Map<string, ReactionFriend[]>();
    for (const part of chunk(ids, FRIENDS_BATCH)) {
      const { data, error } = await supabase.rpc("reaction_friends", { p_ids: part, p_per: 2 });
      if (error || !data) continue;
      for (const row of data as FriendRow[]) {
        if (!isReactionKey(row.reaction)) continue;
        const list = found.get(row.target_id) ?? [];
        list.push({ userId: row.user_id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url, reaction: row.reaction });
        found.set(row.target_id, list);
      }
    }
    return found;
  },
  FRIENDS_BATCH,
);

/** The (at most two) people the viewer follows who reacted — empty for a guest. Batched across the cards of a page. */
export async function fetchReactionFriends(id: string, userId: string | null): Promise<ReactionFriend[]> {
  if (!userId) return [];
  const blocked = await getBlockedIds();
  return ((await friendsLookup(userId)(id)) ?? []).filter((friend) => !blocked.has(friend.userId));
}

/** Changes the viewer's own reaction on a target they already reacted to. A row that is not there is an error, never a silent success. */
export async function changeReaction(id: string, userId: string, contentType: LikeableContentType, reaction: ReactionKey): Promise<void> {
  const { data, error } = await supabase
    .from("prompt_likes")
    .update({ reaction })
    .eq(likeTargetColumn(contentType), id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("reaction_not_found");
}

export const REACTORS_PAGE = 24;

/** One person who reacted: `user` is `null` when the account no longer has a public profile. */
export interface Reactor {
  key: string;
  user: UserProfile | null;
  reaction: ReactionKey;
  createdAt: string;
}

/**
 * One page of the people who reacted to a target, newest first, optionally only one reaction (the sheet's tabs). `total` is counted with the
 * first page. People the viewer blocked are left out after the page is read (the cursor comes from the raw rows, so a page of blocked people
 * is not mistaken for the end).
 */
export async function fetchReactorsPage(
  contentType: LikeableContentType,
  id: string,
  reaction: ReactionKey | null,
  offset: number,
  limit = REACTORS_PAGE,
): Promise<PagedResult<Reactor>> {
  let query = supabase
    .from("prompt_likes")
    .select(`user_id, reaction, created_at, profiles:user_id ( ${PROFILE_SELECT} )`, offset === 0 ? { count: "exact" } : undefined)
    .eq(likeTargetColumn(contentType), id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  if (reaction) query = query.eq("reaction", reaction);
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { user_id: string; reaction: string | null; created_at: string; profiles: ProfileRow | null }[];
  const blocked = await getBlockedIds();
  return {
    items: rows
      .filter((row) => !blocked.has(row.user_id))
      .map((row) => ({
        key: row.user_id,
        user: row.profiles ? mapProfileRow(row.profiles) : null,
        reaction: isReactionKey(row.reaction) ? row.reaction : DEFAULT_REACTION,
        createdAt: row.created_at,
      })),
    total: offset === 0 ? count ?? null : null,
    nextOffset: rows.length === limit ? offset + limit : null,
  };
}
