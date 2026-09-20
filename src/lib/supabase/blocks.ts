import { supabase } from "./client";

/**
 * Does `blockerId` currently block `blockedId`? Only readable from the
 * blocker's own side — the `blocks` SELECT policy (Bölüm 19) only lets a
 * user see rows where they themselves are the blocker, so this can never
 * be used to check "did the other person block me" (see `is_blocked` in
 * the Faz B migration for that, used server-side in RLS/RPCs only).
 */
export async function fetchIsBlockedByMe(blockerId: string, blockedId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("blocks")
      .select("blocker_id")
      .eq("blocker_id", blockerId)
      .eq("blocked_id", blockedId)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (err) {
    console.error("fetchIsBlockedByMe", err);
    return false;
  }
}

/**
 * Genuinely, permanently blocks a real user (Bölüm 21 Faz B). The
 * `blocks_after_insert_remove_follows` trigger also drops any existing
 * follow relationship between the two in either direction, and the
 * messaging RLS policies immediately start rejecting new conversations/
 * messages between them via `is_blocked()`.
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from("blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw new Error(error.message);
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  if (error) throw new Error(error.message);
}
