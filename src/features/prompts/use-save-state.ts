"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useSave } from "./like-save-provider";
import { isUuid } from "@/lib/utils";
import { fetchIsSaved, savePrompt, unsavePrompt } from "@/lib/supabase/saves";

/** Same idea as `useLikeState`, for saving — no count to track, saves are never shown as a number. */
export function useSaveState(id: string) {
  const { user } = useAuth();
  const local = useSave();
  const isReal = isUuid(id);

  const [realSaved, setRealSaved] = useState(false);
  const [loading, setLoading] = useState(isReal);

  useEffect(() => {
    let cancelled = false;
    if (!isReal || !user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing async to check for a mock/local prompt or signed-out viewer
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchIsSaved(id, user.id).then((result) => {
      if (!cancelled) {
        setRealSaved(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isReal, user, id]);

  const toggle = useCallback(async () => {
    if (!isReal) {
      local.toggleSave(id);
      return;
    }
    if (!user) return;

    if (realSaved) {
      setRealSaved(false);
      try {
        await unsavePrompt(id, user.id);
      } catch (err) {
        console.error("unsavePrompt", err);
        setRealSaved(true);
      }
    } else {
      setRealSaved(true);
      try {
        await savePrompt(id, user.id);
      } catch (err) {
        console.error("savePrompt", err);
        setRealSaved(false);
      }
    }
  }, [isReal, user, realSaved, id, local]);

  if (isReal) {
    return { isSaved: realSaved, toggle, loading, canSave: Boolean(user) };
  }

  return { isSaved: local.isSaved(id), toggle, loading: false, canSave: true };
}
