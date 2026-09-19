"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { UserProfile } from "@/types";

const STORAGE_KEY = "promptly-profile-overrides";

export interface ProfileOverrides {
  displayName?: string;
  bio?: string;
  website?: string | null;
  interests?: string[];
  avatarDataUrl?: string | null;
}

interface ProfileOverridesContextValue {
  overrides: ProfileOverrides;
  /** Merges the "me" overrides into a user object; other users pass through unchanged. */
  applyOverrides: (user: UserProfile) => UserProfile;
  updateOverrides: (patch: ProfileOverrides) => void;
}

const ProfileOverridesContext = createContext<ProfileOverridesContextValue | null>(null);

/**
 * Real, working "edit my profile" state — same localStorage architecture as
 * FollowProvider/LikeProvider (CLAUDE.md section 2): this browser only,
 * never claims to sync to other viewers or a server. Only ever applied to
 * the "me" mock user — there's no auth, so editing anyone else's profile
 * would be meaningless. Username is intentionally not editable here: every
 * profile route is statically generated from the mock username at build
 * time (`generateStaticParams`), so a real rename needs server-side
 * routing/redirects that only exist once Supabase Auth lands (CLAUDE.md
 * section 17).
 */
export function ProfileOverridesProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<ProfileOverrides>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOverrides(JSON.parse(stored));
      }
    } catch {
      // localStorage unavailable or corrupt — start with no overrides.
    }
  }, []);

  const updateOverrides = useCallback((patch: ProfileOverrides) => {
    setOverrides((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable — edit still applies for this session.
      }
      return next;
    });
  }, []);

  const applyOverrides = useCallback(
    (user: UserProfile): UserProfile => {
      if (user.id !== "me") return user;
      return {
        ...user,
        displayName: overrides.displayName ?? user.displayName,
        bio: overrides.bio !== undefined ? overrides.bio : user.bio,
        website: overrides.website !== undefined ? overrides.website : user.website,
        interests: overrides.interests ?? user.interests,
        avatarUrl: overrides.avatarDataUrl !== undefined ? overrides.avatarDataUrl : user.avatarUrl,
      };
    },
    [overrides],
  );

  const value = useMemo(
    () => ({ overrides, applyOverrides, updateOverrides }),
    [overrides, applyOverrides, updateOverrides],
  );

  return <ProfileOverridesContext.Provider value={value}>{children}</ProfileOverridesContext.Provider>;
}

export function useProfileOverrides() {
  const ctx = useContext(ProfileOverridesContext);
  if (!ctx) throw new Error("useProfileOverrides must be used within a ProfileOverridesProvider");
  return ctx;
}
