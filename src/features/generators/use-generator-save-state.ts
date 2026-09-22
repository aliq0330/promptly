"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { isGeneratorSaved, saveGeneratorToDefault, unsaveGeneratorFromDefault } from "@/lib/supabase/collections";

/**
 * Real, per-viewer bookmark state for one generator — now backed by the
 * real collection system (the caller's own default "Genel" collection),
 * not the old `generator_saves` boolean table (Bölüm 9.27, atıl bırakıldı
 * — Bölüm 9.34'ün shared-social entegrasyonu). A generator can only be
 * saved to ONE place (the default collection) in this phase — saving it
 * to a custom, named collection like a prompt can needs a fuller
 * multi-collection UI, deliberately deferred (see CLAUDE.md Bölüm 9.34).
 * Same `isToggling`-guarded optimistic-with-rollback shape as
 * `useSaveState`/`useFollowState`/`useLikeState`.
 */
export function useGeneratorSaveState(generatorId: string) {
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
    isGeneratorSaved(generatorId, user.id).then((result) => {
      if (!cancelled) {
        setIsSaved(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, generatorId]);

  const toggle = useCallback(async () => {
    if (!user || isToggling) return;
    setIsToggling(true);
    const next = !isSaved;
    setIsSaved(next);
    try {
      if (next) await saveGeneratorToDefault(generatorId, user.id);
      else await unsaveGeneratorFromDefault(generatorId, user.id);
    } catch (err) {
      console.error("useGeneratorSaveState toggle", err);
      setIsSaved(!next);
    } finally {
      setIsToggling(false);
    }
  }, [user, generatorId, isSaved, isToggling]);

  return { isSaved, toggle, loading, isToggling, canSave: Boolean(user) };
}
