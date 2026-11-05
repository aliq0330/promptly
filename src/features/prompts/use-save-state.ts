"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { isPromptSaved, saveWork } from "@/lib/supabase/collections";
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
type SaveableContentType = Extract<LikeableContentType, "prompt" | "workflow" | "preset" | "community_post">;

/**
 * Whether the current viewer saved a real prompt / workflow / preset / community post — true iff it is in their
 * system collection ("Kaydedilenlerin tümü", see `isPromptSaved`). Saving is its own step, separate from collections
 * (docs/history/336-*): `quickSave` saves with one tap, `SaveToCollectionModal` files a saved work into collections and
 * can take it out of the saved area. This is the single source of truth for the bookmark icon everywhere it appears
 * (feed, discover, profile, collection detail, "Kaydedilenlerin tümü"); this hook mirrors the result.
 * `contentType` defaults to `"prompt"`.
 *
 * `saveCount` is the real, trigger-maintained `save_count` column (one save per distinct user, not per collection).
 * Like `isSaved`, it's read/written through `engagement-store` rather than local `useState` — once
 * any component for this id has mounted this session, its count lives
 * there, so navigating to a different page never shows a stale 0 again
 * (the same fix applied to likes/follows), and
 * `engagement-realtime-provider.tsx` converges it across tabs/other users.
 */
export function useSaveState(id: string, contentType: SaveableContentType = "prompt", saveCount = 0) {
  const { user } = useAuth();
  const key = engagementStore.keyOf("save", contentType, id);
  const entry = useEngagementEntry("save", contentType, id, saveCount);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

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
   * Reflects a save/unsave that a caller already performed for real elsewhere (the collection modal's add that saved
   * an unsaved work, or its "Kaydedilenlerden kaldır") — never a fake/optimistic guess; always a genuine ±1, matching
   * what the server's per-owner-dedup `save_count` trigger computes for the same transition.
   */
  const markSaved = useCallback(() => {
    engagementStore.applyToggle(key, true, 1);
  }, [key]);

  const markUnsaved = useCallback(() => {
    engagementStore.applyToggle(key, false, -1);
  }, [key]);

  /**
   * One-tap save: puts the work in "Kaydedilenlerin tümü" (no collection) and only on a confirmed write flips the
   * bookmark. Returns whether the work is saved afterwards; a failure changes nothing. Re-entrant taps are ignored.
   */
  const quickSave = useCallback(async (): Promise<boolean> => {
    if (!user || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await saveWork(user.id, id, contentType);
      markSaved();
      return true;
    } catch (err) {
      console.error("quickSave", err);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [user, id, contentType, markSaved]);

  return {
    isSaved: entry.active,
    saveCount: entry.count,
    markSaved,
    markUnsaved,
    quickSave,
    saving,
    loading: Boolean(user) && !entry.activeChecked,
    canSave: Boolean(user),
  };
}
