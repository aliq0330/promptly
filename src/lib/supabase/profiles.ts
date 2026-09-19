import { supabase } from "./client";
import type { UserProfile } from "@/types";
import { mapProfileRow, type ProfileRow } from "./mappers";

const PROFILE_SELECT =
  "id, username, display_name, avatar_url, cover_url, bio, website, follower_count, following_count, created_at, interests";

/**
 * The real `profiles` row for a signed-in Supabase user — created
 * automatically by the `handle_new_user` trigger the moment they sign up
 * (CLAUDE.md Bölüm 18). Returns null if it hasn't appeared yet (shouldn't
 * normally happen — the trigger runs synchronously as part of signup) or
 * the row genuinely can't be read.
 */
export async function fetchOwnProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfileRow(data as ProfileRow);
}
