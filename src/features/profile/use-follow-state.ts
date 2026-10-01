"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsFollowing, followUser, unfollowUser } from "@/lib/supabase/follows";
import { engagementStore, useEngagementEntry } from "@/features/content/engagement-store";
import type { UserProfile } from "@/types";

/**
 * Whether the current viewer follows `target`, and their real follower
 * count — every profile is a real Supabase account now (CLAUDE.md's mock
 * data removal), so this always talks to the real `follows` table.
 * `canFollow` is false while signed out: RLS requires an authenticated
 * session to write a `follows` row.
 *
 * Reads/writes `engagement-store` instead of local `useState` — the SAME
 * fix `useLikeState` got (CLAUDE.md), extended to follows: a standalone
 * `FollowButton` on a creator row and `ProfileHeader`'s own call for the
 * same user now share one live count instead of each starting from
 * whatever stale `followerCount` their own cached profile object carried.
 */
export function useFollowState(target: UserProfile) {
  const { user } = useAuth();
  const key = engagementStore.keyOf("follow", "", target.id);
  const entry = useEngagementEntry("follow", "", target.id, target.followerCount);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    const { activeChecked } = engagementStore.readActive(key);
    if (activeChecked) return;
    fetchIsFollowing(user.id, target.id).then((result) => {
      if (!cancelled) engagementStore.setActive(key, result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, target.id, key]);

  const toggle = useCallback(async () => {
    if (!user) return; // canFollow is false in this case — nothing to toggle
    const wasFollowing = engagementStore.readActive(key).active;
    engagementStore.applyToggle(key, !wasFollowing, wasFollowing ? -1 : 1);
    try {
      if (wasFollowing) await unfollowUser(user.id, target.id);
      else await followUser(user.id, target.id);
    } catch (err) {
      console.error(wasFollowing ? "unfollowUser" : "followUser", err);
      engagementStore.applyToggle(key, wasFollowing, wasFollowing ? 1 : -1);
    }
  }, [user, target.id, key]);

  return {
    isFollowing: entry.active,
    followerCount: entry.count,
    toggle,
    loading: Boolean(user) && !entry.activeChecked,
    canFollow: Boolean(user),
  };
}
