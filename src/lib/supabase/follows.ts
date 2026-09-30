import { supabase } from "./client";
import { batcherRegistry } from "./batched-lookup";

const followLookup = batcherRegistry((followerId) => async (ids) => {
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", followerId)
    .in("following_id", ids);
  if (error || !data) return new Set();
  return new Set((data as { following_id: string }[]).map((row) => row.following_id));
});

/** Does `followerId` already follow `followingId` for real? RLS (Bölüm 19) already makes this public read. Concurrent calls are batched into one query. */
export async function fetchIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  return followLookup(followerId)(followingId);
}

/** Genuinely, permanently follows a real user. `handle_follow_change` (Bölüm 19) keeps both profiles' counters in sync. */
export async function followUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase.from("follows").insert({ follower_id: followerId, following_id: followingId });
  if (error) throw new Error(error.message);
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId);
  if (error) throw new Error(error.message);
}
