"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsLiked, likeContent, unlikeContent, type LikeableContentType } from "@/lib/supabase/likes";

/**
 * Whether the current viewer liked a real prompt or generator, and its
 * real like count — every prompt/generator is a real Supabase row now
 * (CLAUDE.md's mock data removal / Bölüm 9.34's shared social layer).
 * `canLike` is false while signed out: RLS requires an authenticated
 * session to write a `prompt_likes` row. `contentType` defaults to
 * `"prompt"` so every existing prompt call site keeps working unchanged.
 */
export function useLikeState(id: string, likeCount: number, contentType: LikeableContentType = "prompt") {
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
    fetchIsLiked(id, user.id, contentType).then((result) => {
      if (!cancelled) {
        setIsLiked(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, id, contentType]);

  const toggle = useCallback(async () => {
    if (!user) return;

    if (isLiked) {
      setIsLiked(false);
      setCount((c) => Math.max(0, c - 1));
      try {
        await unlikeContent(id, user.id, contentType);
      } catch (err) {
        console.error("unlikeContent", err);
        setIsLiked(true);
        setCount((c) => c + 1);
      }
    } else {
      setIsLiked(true);
      setCount((c) => c + 1);
      try {
        await likeContent(id, user.id, contentType);
      } catch (err) {
        console.error("likeContent", err);
        setIsLiked(false);
        setCount((c) => Math.max(0, c - 1));
      }
    }
  }, [user, isLiked, id, contentType]);

  return { isLiked, likeCount: count, toggle, loading, canLike: Boolean(user) };
}
