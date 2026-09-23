"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { isPromptSaved, removeFromSavedEverywhere } from "@/lib/supabase/collections";
import type { LikeableContentType as SaveableContentType } from "@/lib/supabase/likes";

/**
 * Whether the current viewer generally saved a real prompt OR generator —
 * true iff it's a member of ANY of their own collections, default ("Genel")
 * or custom (Bölüm 9.38 — see `isPromptSaved`'s own doc comment for why this
 * changed from the original "default collection only" rule). No count,
 * saves are never shown as a number. This is the single source of truth for
 * the bookmark icon everywhere it appears (feed, discover, profile,
 * collection detail) — every instance re-fetches this fresh on mount, so a
 * removal on one screen is always reflected correctly the next time a card
 * for the same prompt renders (CLAUDE.md Bölüm 9.22 §16). `contentType`
 * defaults to `"prompt"` so every existing prompt call site keeps working
 * unchanged — a generator now uses this SAME hook (Bölüm 9.36's Prompt/
 * Generator parity pass), replacing the old, separate, modal-less
 * `useGeneratorSaveState`.
 */
export function useSaveState(id: string, contentType: SaveableContentType = "prompt") {
  const { user } = useAuth();

  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to check while signed out
      setLoading(false);
      return;
    }
    setLoading(true);
    isPromptSaved(id, user.id, contentType).then((result) => {
      if (!cancelled) {
        setIsSaved(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, id, contentType]);

  /**
   * The general "kaydedilenlerden kaldır" action — removes this prompt/
   * generator from the user's default collection AND every one of their
   * other collections that also contains it (CLAUDE.md Bölüm 9.22 §7),
   * never just from one screen's local view. Optimistic with rollback on
   * failure; guarded against overlapping calls so a double-click can't fire
   * two requests. Resolves `true` only on a real, confirmed success, so a
   * caller can decide whether it's honest to show a "removed" confirmation.
   */
  const removeEverywhere = useCallback(async () => {
    if (!user || isToggling) return false;
    setIsToggling(true);
    setIsSaved(false);
    try {
      await removeFromSavedEverywhere(id, contentType);
      return true;
    } catch (err) {
      console.error("removeFromSavedEverywhere", err);
      setIsSaved(true);
      return false;
    } finally {
      setIsToggling(false);
    }
  }, [user, id, contentType, isToggling]);

  /**
   * Reflects a save that a caller already performed for real elsewhere (the
   * collection-picker modal's own `addItemToCollection`, onto ANY
   * collection — Bölüm 9.38, not just the default one) — never a fake/
   * optimistic guess, just skips an unnecessary refetch of state this
   * component already knows is true.
   */
  const markSaved = useCallback(() => {
    setIsSaved(true);
  }, []);

  /**
   * The mirror of `markSaved` — reflects a real removal that happened
   * elsewhere and left the item saved in NO collection at all (the modal's
   * own membership-count bookkeeping, Bölüm 9.38) without a refetch.
   */
  const markUnsaved = useCallback(() => {
    setIsSaved(false);
  }, []);

  return { isSaved, removeEverywhere, markSaved, markUnsaved, loading, isToggling, canSave: Boolean(user) };
}
