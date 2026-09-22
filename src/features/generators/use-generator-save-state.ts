"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsGeneratorSaved, saveGenerator, unsaveGenerator } from "@/lib/supabase/generators";

/**
 * Real, per-viewer bookmark state for one generator (`generator_saves` —
 * plain boolean, unlike a prompt's collection-backed save; a generator
 * doesn't have a "which collection" concept, CLAUDE.md deliberately kept it
 * simple). Same `isToggling`-guarded optimistic-with-rollback shape as
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
    fetchIsGeneratorSaved(generatorId, user.id).then((result) => {
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
      if (next) await saveGenerator(generatorId, user.id);
      else await unsaveGenerator(generatorId, user.id);
    } catch (err) {
      console.error("useGeneratorSaveState toggle", err);
      setIsSaved(!next);
    } finally {
      setIsToggling(false);
    }
  }, [user, generatorId, isSaved, isToggling]);

  return { isSaved, toggle, loading, isToggling, canSave: Boolean(user) };
}
