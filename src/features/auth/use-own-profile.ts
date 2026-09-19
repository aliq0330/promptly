"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-provider";
import { fetchOwnProfile } from "@/lib/supabase/profiles";
import type { UserProfile } from "@/types";

/**
 * The signed-in Supabase user's real `profiles` row (CLAUDE.md Bölüm 18/21)
 * — separate from `useAuth()`, which only knows *that* someone is
 * authenticated, not their display name/avatar/username. Returns
 * `profile: null` both while there's no session and while the real row is
 * still loading — check `loading` to tell those apart.
 */
export function useOwnProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronous reset when the session disappears, not a cascading update
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchOwnProfile(user.id).then((result) => {
      if (!cancelled) {
        setProfile(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return { profile, loading };
}
