"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsSaved, savePrompt, unsavePrompt } from "@/lib/supabase/saves";

/** Whether the current viewer saved a real prompt — no count, saves are never shown as a number. */
export function useSaveState(id: string) {
  const { user } = useAuth();

  const [isSaved, setIsSaved] = useState(false);
  const [loading, setLoading] = useState(true);

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

  const toggle = useCallback(async () => {
    if (!user) return;

    if (isSaved) {
      setIsSaved(false);
      try {
        await unsavePrompt(id, user.id);
      } catch (err) {
        console.error("unsavePrompt", err);
        setIsSaved(true);
      }
    } else {
      setIsSaved(true);
      try {
        await savePrompt(id, user.id);
      } catch (err) {
        console.error("savePrompt", err);
        setIsSaved(false);
      }
    }
  }, [user, isSaved, id]);

  return { isSaved, toggle, loading, canSave: Boolean(user) };
}
