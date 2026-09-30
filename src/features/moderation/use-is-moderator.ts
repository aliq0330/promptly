"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchIsModerator } from "@/lib/supabase/moderation";

const cache = new Map<string, boolean>();

/** True only for a signed-in moderator (server-checked via `is_moderator()`); false while loading or signed out. */
export function useIsModerator(): boolean {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!userId || cache.has(userId)) return;
    let cancelled = false;
    void fetchIsModerator().then((result) => {
      cache.set(userId, result);
      if (!cancelled) setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return userId ? (cache.get(userId) ?? false) : false;
}
