"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsLiked, likeContent, unlikeContent, type LikeableContentType } from "@/lib/supabase/likes";
import { engagementStore, useEngagementEntry } from "@/features/content/engagement-store";
import type { LikeToggleResult } from "@/components/ui/like-toggle";

/**
 * Targets whose like/unlike request is still in flight. Module-level on
 * purpose: a card and a detail page showing the same item share one guard,
 * so rapid clicks never fire duplicate requests or double-apply the count.
 */
const inFlight = new Set<string>();

/**
 * Whether the current viewer liked a real prompt or generator, and its
 * real like count — every prompt/generator is a real Supabase row now
 * (CLAUDE.md's mock data removal / Bölüm 9.34's shared social layer).
 * `canLike` is false while signed out: RLS requires an authenticated
 * session to write a `prompt_likes` row. `contentType` defaults to
 * `"prompt"` so every existing prompt call site keeps working unchanged.
 *
 * Reads/writes `engagement-store` instead of local `useState` (CLAUDE.md's
 * fix for "beğeni sayısı navigasyon sonrası sıfıra dönüyor") — the shared
 * store, not this one component instance, is the source of truth for the
 * count once any instance for this id has mounted this session, and
 * `engagement-realtime-provider.tsx` keeps it converging to the real
 * `like_count` column across tabs/other users too.
 */
export function useLikeState(id: string, likeCount: number, contentType: LikeableContentType = "prompt") {
  const { user } = useAuth();
  const key = engagementStore.keyOf("like", contentType, id);
  const entry = useEngagementEntry("like", contentType, id, likeCount);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    const { activeChecked } = engagementStore.readActive(key);
    if (activeChecked) return;
    fetchIsLiked(id, user.id, contentType).then((result) => {
      if (!cancelled) engagementStore.setActive(key, result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, id, contentType, key]);

  const toggle = useCallback(async (): Promise<LikeToggleResult> => {
    if (!user || inFlight.has(key)) return "ignored";
    inFlight.add(key);
    const wasLiked = engagementStore.readActive(key).active;
    engagementStore.applyToggle(key, !wasLiked, wasLiked ? -1 : 1);
    try {
      if (wasLiked) await unlikeContent(id, user.id, contentType);
      else await likeContent(id, user.id, contentType);
      return wasLiked ? "unliked" : "liked";
    } catch (err) {
      console.error(wasLiked ? "unlikeContent" : "likeContent", err);
      engagementStore.applyToggle(key, wasLiked, wasLiked ? 1 : -1);
      return "failed";
    } finally {
      inFlight.delete(key);
    }
  }, [user, id, contentType, key]);

  return {
    isLiked: entry.active,
    likeCount: entry.count,
    toggle,
    loading: Boolean(user) && !entry.activeChecked,
    canLike: Boolean(user),
  };
}
