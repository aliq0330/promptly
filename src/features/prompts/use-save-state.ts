"use client";

import { useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchCollectionIdsContaining, isPromptSaved } from "@/lib/supabase/collections";
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
type SaveableContentType = Extract<LikeableContentType, "prompt" | "workflow" | "preset">;

/**
 * Whether the current viewer generally saved a real prompt OR generator —
 * true iff it's a member of ANY of their own collections, default ("Genel")
 * or custom (see `isPromptSaved`). This is the single source of truth for the
 * bookmark icon everywhere it appears (feed, discover, profile, collection
 * detail, "Kaydedilenler"). Changing the memberships goes through
 * `SaveToCollectionModal` only; this hook just mirrors the result. `contentType` defaults to
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
   * Reflects a save that a caller already performed for real elsewhere (the
   * collection-picker modal's own `addItemToCollection`, onto ANY
   * collection) — never a fake/optimistic guess. `SaveToCollectionModal`
   * only calls this on the real zero→one-plus transition, so it's always a
   * genuine +1, matching exactly what the server's own per-owner-dedup
   * `save_count` trigger will also compute for that same transition.
   */
  const markSaved = useCallback(() => {
    engagementStore.applyToggle(key, true, 1);
  }, [key]);

  /**
   * The mirror of `markSaved` — reflects a real removal that happened
   * elsewhere and left the item saved in NO collection at all (the modal's
   * own membership-count bookkeeping), always a genuine -1.
   */
  const markUnsaved = useCallback(() => {
    engagementStore.applyToggle(key, false, -1);
  }, [key]);

  return {
    isSaved: entry.active,
    saveCount: entry.count,
    markSaved,
    markUnsaved,
    loading: Boolean(user) && !entry.activeChecked,
    canSave: Boolean(user),
  };
}

/**
 * Re-reads the viewer's real memberships for one work and brings its shared
 * save state in line — for a removal made somewhere that isn't the save
 * modal (a collection's own "Koleksiyondan kaldır"), where the bookmark may
 * or may not have to empty depending on whether another collection still
 * holds the work. A failed read changes nothing rather than guessing.
 */
export async function refreshSaveState(id: string, contentType: SaveableContentType, userId: string): Promise<void> {
  try {
    const saved = (await fetchCollectionIdsContaining(id, userId, contentType)).size > 0;
    const key = engagementStore.keyOf("save", contentType, id);
    const { active, activeChecked } = engagementStore.readActive(key);
    if (!activeChecked || active === saved) engagementStore.setActive(key, saved);
    else engagementStore.applyToggle(key, saved, saved ? 1 : -1);
  } catch (err) {
    console.error("refreshSaveState", err);
  }
}
