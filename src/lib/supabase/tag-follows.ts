import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";

/** A tag the viewer follows (`public.tag_follows`, migration 20260919860000). */
export interface FollowedTag {
  slug: string;
  label: string;
}

/** Most tags one person can follow — enforced by the database (`tag_follow_limit`), mirrored here for the UI. */
export const MAX_FOLLOWED_TAGS = 100;

/** Thrown by `followTag` when the 100-tag limit is hit, so the UI can say so instead of a generic failure. */
export class TagFollowLimitError extends Error {
  constructor() {
    super("tag_follow_limit");
    this.name = "TagFollowLimitError";
  }
}

interface FollowRow {
  tag_slug: string;
  tags: { slug: string; label: string } | { slug: string; label: string }[] | null;
}

/** Every tag the signed-in viewer follows, newest follow first (RLS: only their own rows are visible). */
export async function fetchFollowedTags(userId: string): Promise<FollowedTag[]> {
  const { data, error } = await supabase
    .from("tag_follows")
    .select("tag_slug, tags ( slug, label )")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FollowRow[]).flatMap((row) => {
    const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
    return tag ? [{ slug: tag.slug, label: tag.label }] : [];
  });
}

/** Follows a tag. Following it twice is not an error (the unique key already says so). */
export async function followTag(userId: string, slug: string): Promise<void> {
  const { error } = await supabase.from("tag_follows").insert({ user_id: userId, tag_slug: slug });
  if (!error) return;
  if (error.code === "23505") return;
  if (error.message.includes("tag_follow_limit")) throw new TagFollowLimitError();
  throw new Error(error.message || translateForRuntime("tag.followFailed"));
}

/** Unfollows a tag. Unfollowing one that is not followed is not an error either. */
export async function unfollowTag(userId: string, slug: string): Promise<void> {
  const { error } = await supabase.from("tag_follows").delete().eq("user_id", userId).eq("tag_slug", slug);
  if (error) throw new Error(error.message || translateForRuntime("tag.followFailed"));
}
