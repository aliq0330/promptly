"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsFollowing, followUser, unfollowUser } from "@/lib/supabase/follows";
import type { UserProfile } from "@/types";

/**
 * Whether the current viewer follows `target`, and their real follower
 * count — every profile is a real Supabase account now (CLAUDE.md's mock
 * data removal), so this always talks to the real `follows` table.
 * `canFollow` is false while signed out: RLS requires an authenticated
 * session to write a `follows` row.
 */
export function useFollowState(target: UserProfile) {
  const { user } = useAuth();

  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(target.followerCount);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched profile (a new object) replaces the previous one
    setFollowerCount(target.followerCount);
  }, [target.followerCount]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check while signed out
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIsFollowing(user.id, target.id).then((result) => {
      if (!cancelled) {
        setIsFollowing(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, target.id]);

  const toggle = useCallback(async () => {
    if (!user) return; // canFollow is false in this case — nothing to toggle

    if (isFollowing) {
      setIsFollowing(false);
      setFollowerCount((count) => Math.max(0, count - 1));
      try {
        await unfollowUser(user.id, target.id);
      } catch (err) {
        console.error("unfollowUser", err);
        setIsFollowing(true);
        setFollowerCount((count) => count + 1);
      }
    } else {
      setIsFollowing(true);
      setFollowerCount((count) => count + 1);
      try {
        await followUser(user.id, target.id);
      } catch (err) {
        console.error("followUser", err);
        setIsFollowing(false);
        setFollowerCount((count) => Math.max(0, count - 1));
      }
    }
  }, [user, isFollowing, target.id]);

  return { isFollowing, followerCount, toggle, loading, canFollow: Boolean(user) };
}
