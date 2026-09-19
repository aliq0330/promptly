import { supabase } from "./client";
import { resizeImageToSquareBlob } from "@/lib/utils";
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
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return mapProfileRow(data as ProfileRow);
  } catch (err) {
    // A real network failure (not a structured Supabase error) throws
    // instead of resolving — without this, a visitor with no connectivity
    // to Supabase would see this promise hang forever instead of
    // gracefully falling back to "not signed in".
    console.error("fetchOwnProfile", err);
    return null;
  }
}

/**
 * Any real profile by its (real, auto-generated) username — for viewing
 * someone else's real profile page (CLAUDE.md Bölüm 21 Faz 2, `/profile/
 * real?username=…`). Public per Bölüm 19's RLS: every profile is readable
 * by anyone, signed in or not.
 */
export async function fetchProfileByUsername(username: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("username", username)
      .maybeSingle();
    if (error || !data) return null;
    return mapProfileRow(data as ProfileRow);
  } catch (err) {
    // See fetchOwnProfile's comment — a real network failure throws rather
    // than resolving with a structured error.
    console.error("fetchProfileByUsername", err);
    return null;
  }
}

export interface UpdateOwnProfileInput {
  displayName: string;
  bio: string | null;
  website: string | null;
  interests: string[];
  /** `undefined` = leave unchanged, `null` = remove, a string = the new (already-uploaded) public URL. */
  avatarUrl?: string | null;
}

/** Genuinely, permanently updates the signed-in user's own `profiles` row. RLS only allows a user to update their own row (Bölüm 19). */
export async function updateOwnProfile(userId: string, input: UpdateOwnProfileInput): Promise<UserProfile> {
  const patch: Record<string, unknown> = {
    display_name: input.displayName,
    bio: input.bio,
    website: input.website,
    interests: input.interests,
  };
  if (input.avatarUrl !== undefined) {
    patch.avatar_url = input.avatarUrl;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_SELECT)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Profil güncellenemedi.");
  return mapProfileRow(data as ProfileRow);
}

/**
 * Uploads a real avatar to the `avatars` Storage bucket (CLAUDE.md Bölüm
 * 20) under this user's own folder — the only path RLS lets them write to
 * — and returns its public URL. A single, always-overwritten filename per
 * user (`avatar.jpg`) rather than a new file per upload, since a profile
 * only ever needs to show its current avatar, not a history of old ones;
 * a cache-busting query param is appended so re-uploading immediately
 * shows the new image instead of a cached copy of the old one at the same
 * URL.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const { blob, contentType } = await resizeImageToSquareBlob(file, 320);
  const path = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
