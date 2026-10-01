"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { isPromptSaved, removeFromSavedEverywhere } from "@/lib/supabase/collections";
import { engagementStore, useEngagementEntry } from "@/features/content/engagement-store";
import type { LikeableContentType } from "@/lib/supabase/likes";

/**
 * Saving only ever targets a prompt or a generator — a request has no save/
 * collection feature (this task's own scope: "[Kaydet varsa mevcut
 * davranışı]"). Narrowed via `Extract` rather than re-aliasing
 * `LikeableContentType` directly, so widening the like system (adding
 * `"request"`, above) can never silently let a request flow through the
 * save code path too.
 */
type SaveableContentType = Extract<LikeableContentType, "prompt" | "generator" | "workflow">;

/**
 * Whether the current viewer generally saved a real prompt OR generator —
 * true iff it's a member of ANY of their own collections, default ("Genel")
 * or custom (Bölüm 9.38 — see `isPromptSaved`'s own doc comment for why this
 * changed from the original "default collection only" rule). This is the
 * single source of truth for the bookmark icon everywhere it appears (feed,
 * discover, profile, collection detail). `contentType` defaults to
 * `"prompt"` so every existing prompt call site keeps working unchanged —
 * a generator now uses this SAME hook (Bölüm 9.36's Prompt/Generator parity
 * pass), replacing the old, separate, modal-less `useGeneratorSaveState`.
 *
 * `saveCount` is the real, trigger-maintained `save_count` column (CLAUDE.md
 * — one save per distinct user, not per collection; adding to a second of
 * your OWN collections doesn't bump it again). Like `isSaved`, it's read/
 * written through `engagement-store` rather than local `useState` — once
 * any component for this id has mounted this session, its count lives
 * there, so navigating to a different page never shows a stale 0 again
 * (the same fix applied to likes/follows), and
 * `engagement-realtime-provider.tsx` converges it across tabs/other users.
 */
export function useSaveState(id: string, contentType: SaveableContentType = "prompt", saveCount = 0) {
  const { user } = useAuth();
  const key = engagementStore.keyOf("save", contentType, id);
  const entry = useEngagementEntry("save", contentType, id, saveCount);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    const { activeChecked } = engagementStore.readActive(key);
    if (activeChecked) return;
    isPromptSaved(id, user.id, contentType).then((result) => {
      if (!cancelled) engagementStore.setActive(key, result);
    });
    return () => {
      cancelled = true;
    };
  }, [user, id, contentType, key]);

  /**
   * The general "kaydedilenlerden kaldır" action — removes this prompt/
   * generator from the user's default collection AND every one of their
   * other collections that also contains it (CLAUDE.md Bölüm 9.22 §7),
   * never just from one screen's local view. Optimistic with rollback on
   * failure; guarded against overlapping calls so a double-click can't fire
   * two requests. Resolves `true` only on a real, confirmed success, so a
   * caller can decide whether it's honest to show a "removed" confirmation.
   * This is always a true zero-collections transition (only called while
   * `isSaved` is true), so it's always a real -1 to the shared count.
   */
  const removeEverywhere = useCallback(async () => {
    if (!user || isToggling) return false;
    setIsToggling(true);
    engagementStore.applyToggle(key, false, -1);
    try {
      await removeFromSavedEverywhere(id, contentType);
      return true;
    } catch (err) {
      console.error("removeFromSavedEverywhere", err);
      engagementStore.applyToggle(key, true, 1);
      return false;
    } finally {
      setIsToggling(false);
    }
  }, [user, id, contentType, isToggling, key]);

  /**
   * Reflects a save that a caller already performed for real elsewhere (the
   * collection-picker modal's own `addItemToCollection`, onto ANY
   * collection — Bölüm 9.38) — never a fake/optimistic guess.
   * `SaveToCollectionModal` only calls this on the real zero→one-plus
   * transition (`!wasSavedAnywhere`), so it's always a genuine +1, matching
   * exactly what the server's own per-owner-dedup `save_count` trigger will
   * also compute for that same transition.
   */
  const markSaved = useCallback(() => {
    engagementStore.applyToggle(key, true, 1);
  }, [key]);

  /**
   * The mirror of `markSaved` — reflects a real removal that happened
   * elsewhere and left the item saved in NO collection at all (the modal's
   * own membership-count bookkeeping, Bölüm 9.38), always a genuine -1.
   */
  const markUnsaved = useCallback(() => {
    engagementStore.applyToggle(key, false, -1);
  }, [key]);

  return {
    isSaved: entry.active,
    saveCount: entry.count,
    removeEverywhere,
    markSaved,
    markUnsaved,
    loading: Boolean(user) && !entry.activeChecked,
    isToggling,
    canSave: Boolean(user),
  };
}
