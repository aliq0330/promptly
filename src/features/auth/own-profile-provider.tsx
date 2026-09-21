"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth-provider";
import { fetchOwnProfile } from "@/lib/supabase/profiles";
import type { UserProfile } from "@/types";

interface OwnProfileContextValue {
  profile: UserProfile | null;
  /** True while there's no session, and while the real row is still loading — check `useAuth().user` to tell those apart. */
  loading: boolean;
  /** Re-fetches from Supabase (rarely needed — `setProfile` covers the common "I just edited it" case). */
  refresh: () => Promise<void>;
  /** Applies a known-fresh profile (e.g. the result of a just-completed edit) without a round trip. */
  setProfile: (profile: UserProfile) => void;
}

const OwnProfileContext = createContext<OwnProfileContextValue | null>(null);

/**
 * The signed-in Supabase user's real `profiles` row (CLAUDE.md Bölüm
 * 18/21) — separate from `useAuth()`, which only knows *that* someone is
 * authenticated, not their display name/avatar/username. A context rather
 * than a plain hook (its original Bölüm 21 Faz 1 shape) because Faz 2 needs
 * it in several independent places at once — the header avatar, the
 * sidebar/mobile nav's "Profil" link, the create-prompt form, the profile
 * edit form, all wanting the same data — and a plain hook would issue one
 * fetch per call site instead of one for the whole app.
 */
export function OwnProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfileState] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setProfileState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await fetchOwnProfile(user.id);
    setProfileState(result);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetches (or synchronously clears) the real profile whenever the signed-in user changes
    load();
  }, [load]);

  const value = useMemo(
    () => ({ profile, loading, refresh: load, setProfile: setProfileState }),
    [profile, loading, load],
  );

  return <OwnProfileContext.Provider value={value}>{children}</OwnProfileContext.Provider>;
}

export function useOwnProfile() {
  const ctx = useContext(OwnProfileContext);
  if (!ctx) throw new Error("useOwnProfile must be used within an OwnProfileProvider");
  return ctx;
}
