import { supabase } from "./client";

/** Does `followerId` already follow `followingId` for real? RLS (Bölüm 19) already makes this public read. */
export async function fetchIsFollowing(followerId: string, followingId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", followerId)
      .eq("following_id", followingId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("fetchIsFollowing", err);
    return false;
  }
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
