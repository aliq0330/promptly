"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "promptly-following";

/**
 * Seed set — mirrors what the mock data has always assumed "me" follows
 * (see the old hardcoded FOLLOWED_USER_IDS constants this replaces).
 * Real backend follow state replaces this entirely once Supabase is
 * connected (CLAUDE.md section 21).
 */
export const INITIAL_FOLLOWED_USER_IDS = ["u1", "u3", "u5", "u7"];

interface FollowContextValue {
  isFollowing: (userId: string) => boolean;
  wasInitiallyFollowing: (userId: string) => boolean;
  toggleFollow: (userId: string) => void;
}

const FollowContext = createContext<FollowContextValue | null>(null);

/**
 * Real, working follow state — persisted to localStorage the same way
 * ThemeProvider persists the theme choice. This is genuine client-side
 * persistence (survives reloads in this browser); it never claims to sync
 * to other users or a server, which there isn't one yet (CLAUDE.md
 * section 2's rule against faking backend actions).
 */
export function FollowProvider({ children }: { children: React.ReactNode }) {
  const [followedIds, setFollowedIds] = useState<Set<string>>(
    () => new Set(INITIAL_FOLLOWED_USER_IDS),
  );

  // Static seed above renders on the server and on first client paint (so
  // hydration matches); this effect then swaps in whatever the user
  // actually chose last time, same pattern as ThemeProvider.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFollowedIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // localStorage unavailable or corrupt — keep the seed set.
    }
  }, []);

  const toggleFollow = useCallback((userId: string) => {
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // localStorage unavailable — toggle still works for this session.
      }
      return next;
    });
  }, []);

  const isFollowing = useCallback((userId: string) => followedIds.has(userId), [followedIds]);
  const wasInitiallyFollowing = useCallback(
    (userId: string) => INITIAL_FOLLOWED_USER_IDS.includes(userId),
    [],
  );

  const value = useMemo(
    () => ({ isFollowing, wasInitiallyFollowing, toggleFollow }),
    [isFollowing, wasInitiallyFollowing, toggleFollow],
  );

  return <FollowContext.Provider value={value}>{children}</FollowContext.Provider>;
}

export function useFollow() {
  const ctx = useContext(FollowContext);
  if (!ctx) throw new Error("useFollow must be used within a FollowProvider");
  return ctx;
}
