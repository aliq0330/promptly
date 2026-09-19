"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useLike } from "./like-save-provider";
import { isUuid } from "@/lib/utils";
import { fetchIsLiked, likePrompt, unlikePrompt } from "@/lib/supabase/likes";

/**
 * Same real/mock split as `useFollowState`, for liking a prompt (CLAUDE.md
 * Bölüm 21 Faz 3): a real Supabase prompt (a genuine UUID — mock/local/
 * response ids never are) writes a real `prompt_likes` row when the
 * viewer is signed in; everything else keeps the existing
 * `LikeProvider`/localStorage behavior unchanged, since a mock or
 * locally-created prompt has no real row a like could reference anyway.
 */
export function useLikeState(id: string, likeCount: number) {
  const { user } = useAuth();
  const local = useLike();
  const isReal = isUuid(id);

  const [realLiked, setRealLiked] = useState(false);
  const [realLikeCount, setRealLikeCount] = useState(likeCount);
  const [loading, setLoading] = useState(isReal);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched prompt (a new object) replaces the previous one
    setRealLikeCount(likeCount);
  }, [likeCount]);

  useEffect(() => {
    let cancelled = false;
    if (!isReal || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing async to check for a mock/local prompt or signed-out viewer
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIsLiked(id, user.id).then((result) => {
      if (!cancelled) {
        setRealLiked(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isReal, user, id]);

  const toggle = useCallback(async () => {
    if (!isReal) {
      local.toggleLike(id);
      return;
    }
    if (!user) return;

    if (realLiked) {
      setRealLiked(false);
      setRealLikeCount((count) => Math.max(0, count - 1));
      try {
        await unlikePrompt(id, user.id);
      } catch (err) {
        console.error("unlikePrompt", err);
        setRealLiked(true);
        setRealLikeCount((count) => count + 1);
      }
    } else {
      setRealLiked(true);
      setRealLikeCount((count) => count + 1);
      try {
        await likePrompt(id, user.id);
      } catch (err) {
        console.error("likePrompt", err);
        setRealLiked(false);
        setRealLikeCount((count) => Math.max(0, count - 1));
      }
    }
  }, [isReal, user, realLiked, id, local]);

  if (isReal) {
    return { isLiked: realLiked, likeCount: realLikeCount, toggle, loading, canLike: Boolean(user) };
  }

  const isLiked = local.isLiked(id);
  const count = likeCount + (isLiked ? 1 : 0) - (local.wasInitiallyLiked(id) ? 1 : 0);
  return { isLiked, likeCount: count, toggle, loading: false, canLike: true };
}
