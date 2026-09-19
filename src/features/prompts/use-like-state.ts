"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsLiked, likePrompt, unlikePrompt } from "@/lib/supabase/likes";

/**
 * Whether the current viewer liked a real prompt, and its real like count —
 * every prompt is a real Supabase row now (CLAUDE.md's mock data removal).
 * `canLike` is false while signed out: RLS requires an authenticated
 * session to write a `prompt_likes` row.
 */
export function useLikeState(id: string, likeCount: number) {
  const { user } = useAuth();

  const [isLiked, setIsLiked] = useState(false);
  const [count, setCount] = useState(likeCount);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched prompt (a new object) replaces the previous one
    setCount(likeCount);
  }, [likeCount]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check while signed out
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIsLiked(id, user.id).then((result) => {
      if (!cancelled) {
        setIsLiked(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  const toggle = useCallback(async () => {
    if (!user) return;

    if (isLiked) {
      setIsLiked(false);
      setCount((c) => Math.max(0, c - 1));
      try {
        await unlikePrompt(id, user.id);
      } catch (err) {
        console.error("unlikePrompt", err);
        setIsLiked(true);
        setCount((c) => c + 1);
      }
    } else {
      setIsLiked(true);
      setCount((c) => c + 1);
      try {
        await likePrompt(id, user.id);
      } catch (err) {
        console.error("likePrompt", err);
        setIsLiked(false);
        setCount((c) => Math.max(0, c - 1));
      }
    }
  }, [user, isLiked, id]);

  return { isLiked, likeCount: count, toggle, loading, canLike: Boolean(user) };
}
