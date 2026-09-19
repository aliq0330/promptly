import type { UserProfile } from "@/types";

/**
 * Hand-written mirror of the `public.profiles` row shape (see
 * supabase/migrations/20260919120100_profiles.sql) — this project has no
 * generated Database type yet, so these interfaces are kept in sync with
 * the migration SQL by hand. Only the columns the frontend actually reads
 * are listed.
 */
export interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  cover_url: string | null;
  bio: string | null;
  website: string | null;
  follower_count: number;
  following_count: number;
  created_at: string;
  interests: string[] | null;
}

export function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    coverUrl: row.cover_url,
    bio: row.bio,
    website: row.website,
    followerCount: row.follower_count,
    followingCount: row.following_count,
    createdAt: row.created_at,
    interests: row.interests ?? [],
  };
}
