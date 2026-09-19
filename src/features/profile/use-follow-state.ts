"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useFollow } from "./follow-provider";
import { isUuid } from "@/lib/utils";
import { fetchIsFollowing, followUser, unfollowUser } from "@/lib/supabase/follows";
import type { UserProfile } from "@/types";

/**
 * Whether the current viewer follows `target`, and their real (not
 * optimistically-adjusted) follower count — genuinely real, cross-device
 * state when `target` is a real Supabase account (CLAUDE.md Bölüm 21 Faz
 * 3), falling back to the existing `FollowProvider` localStorage behavior
 * for mock users (who have no real `profiles` row to follow at all) —
 * exactly the same real/mock split Faz 1 already established for prompts.
 * `canFollow` is false only for a real target while signed out: RLS
 * requires an authenticated session to write a `follows` row.
 */
export function useFollowState(target: UserProfile) {
  const { user } = useAuth();
  const local = useFollow();
  const isReal = isUuid(target.id);

  const [realFollowing, setRealFollowing] = useState(false);
  const [realFollowerCount, setRealFollowerCount] = useState(target.followerCount);
  const [loading, setLoading] = useState(isReal);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched profile (a new object) replaces the previous one
    setRealFollowerCount(target.followerCount);
  }, [target.followerCount]);

  useEffect(() => {
    let cancelled = false;
    if (!isReal || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing async to check for a mock target or signed-out viewer
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIsFollowing(user.id, target.id).then((result) => {
      if (!cancelled) {
        setRealFollowing(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isReal, user, target.id]);

  const toggle = useCallback(async () => {
    if (!isReal) {
      local.toggleFollow(target.id);
      return;
    }
    if (!user) return; // canFollow is false in this case — nothing to toggle

    if (realFollowing) {
      setRealFollowing(false);
      setRealFollowerCount((count) => Math.max(0, count - 1));
      try {
        await unfollowUser(user.id, target.id);
      } catch (err) {
        console.error("unfollowUser", err);
        setRealFollowing(true);
        setRealFollowerCount((count) => count + 1);
      }
    } else {
      setRealFollowing(true);
      setRealFollowerCount((count) => count + 1);
      try {
        await followUser(user.id, target.id);
      } catch (err) {
        console.error("followUser", err);
        setRealFollowing(false);
        setRealFollowerCount((count) => Math.max(0, count - 1));
      }
    }
  }, [isReal, user, realFollowing, target.id, local]);

  if (isReal) {
    return { isFollowing: realFollowing, followerCount: realFollowerCount, toggle, loading, canFollow: Boolean(user) };
  }

  const isFollowing = local.isFollowing(target.id);
  const followerCount =
    target.followerCount + (isFollowing ? 1 : 0) - (local.wasInitiallyFollowing(target.id) ? 1 : 0);
  return { isFollowing, followerCount, toggle, loading: false, canFollow: true };
}
