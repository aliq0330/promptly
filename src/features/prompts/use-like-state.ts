"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { likeContent, unlikeContent, type LikeableContentType } from "@/lib/supabase/likes";
import { changeReaction, fetchMyReaction } from "@/lib/supabase/reactions";
import { DEFAULT_REACTION, type ReactionKey } from "@/lib/reactions";
import { refreshBreakdown, shiftBreakdown } from "@/features/reactions/reaction-breakdown";
import { engagementStore, useEngagementEntry } from "@/features/content/engagement-store";
import type { LikeToggleResult } from "@/components/ui/like-toggle";

/** What `react` reports: a first reaction (`liked`), a swapped one (`changed`), a removed one (`unliked`), a rolled-back failure, or a click that was ignored. */
export type ReactResult = LikeToggleResult | "changed";

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
    fetchMyReaction(id, user.id, contentType).then((reaction) => {
      if (!cancelled) engagementStore.setActive(key, reaction !== null, reaction);
    });
    return () => {
      cancelled = true;
    };
  }, [user, id, contentType, key]);

  /**
   * Gives, swaps or removes the viewer's reaction (`null` = remove). Every reaction is one like: the first one adds 1 to the count,
   * swapping keeps it, removing takes it back — so `like_count` and everything built on it stay what they were. Optimistic, rolled back on failure.
   */
  const react = useCallback(
    async (next: ReactionKey | null): Promise<ReactResult> => {
      if (!user || inFlight.has(key)) return "ignored";
      const before = engagementStore.readActive(key);
      const prev = before.active ? before.reaction ?? DEFAULT_REACTION : null;
      if (next === prev) return "ignored";
      inFlight.add(key);
      if (prev === null && next !== null) engagementStore.applyToggle(key, true, 1, next);
      else if (prev !== null && next === null) engagementStore.applyToggle(key, false, -1);
      else if (next !== null) engagementStore.setReaction(key, next);
      shiftBreakdown(contentType, id, prev, next);
      try {
        if (next === null) await unlikeContent(id, user.id, contentType);
        else if (prev === null) await likeContent(id, user.id, contentType, next);
        else await changeReaction(id, user.id, contentType, next);
        void refreshBreakdown(contentType, id, user.id);
        return next === null ? "unliked" : prev === null ? "liked" : "changed";
      } catch (err) {
        console.error("react", err);
        if (prev === null && next !== null) engagementStore.applyToggle(key, false, -1);
        else if (prev !== null && next === null) engagementStore.applyToggle(key, true, 1, prev);
        else if (prev !== null) engagementStore.setReaction(key, prev);
        shiftBreakdown(contentType, id, next, prev);
        return "failed";
      } finally {
        inFlight.delete(key);
      }
    },
    [user, id, contentType, key],
  );

  /** The old heart toggle: like (with the default reaction) or take the like back. */
  const toggle = useCallback(async (): Promise<LikeToggleResult> => {
    const result = await react(engagementStore.readActive(key).active ? null : DEFAULT_REACTION);
    return result === "changed" ? "liked" : result;
  }, [react, key]);

  return {
    isLiked: entry.active,
    /** The viewer's own reaction; `null` while they have none (or it is not known yet). */
    reaction: entry.active ? entry.reaction ?? DEFAULT_REACTION : null,
    likeCount: entry.count,
    react,
    toggle,
    loading: Boolean(user) && !entry.activeChecked,
    canLike: Boolean(user),
  };
}
