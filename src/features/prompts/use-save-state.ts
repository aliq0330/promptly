"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsSaved, unsavePrompt } from "@/lib/supabase/saves";

/** Whether the current viewer saved a real prompt — no count, saves are never shown as a number. */
export function useSaveState(id: string) {
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
    fetchIsSaved(id, user.id).then((result) => {
      if (!cancelled) {
        setIsSaved(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, id]);

  /**
   * Removes the general save only (never touches collection membership —
   * see collections.ts's "tek yönlü bağ" decision, CLAUDE.md Bölüm 9.19).
   * Optimistic with rollback on failure; guarded against overlapping calls
   * so a double-click can't fire two DELETEs. Resolves `true` only on a
   * real, confirmed success, so a caller can decide whether it's honest to
   * show a "removed" confirmation.
   */
  const unsave = useCallback(async () => {
    if (!user || isToggling) return false;
    setIsToggling(true);
    setIsSaved(false);
    try {
      await unsavePrompt(id, user.id);
      return true;
    } catch (err) {
      console.error("unsavePrompt", err);
      setIsSaved(true);
      return false;
    } finally {
      setIsToggling(false);
    }
  }, [user, id, isToggling]);

  /**
   * Reflects a save that a caller already performed for real elsewhere
   * (the collection-picker modal's own `addItemToCollection`, which does a
   * genuine `prompt_saves` insert) — never a fake/optimistic guess, just
   * skips an unnecessary refetch of state this component already knows is
   * true.
   */
  const markSaved = useCallback(() => {
    setIsSaved(true);
  }, []);

  return { isSaved, unsave, markSaved, loading, isToggling, canSave: Boolean(user) };
}
