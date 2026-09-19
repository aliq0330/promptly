"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const LIKES_STORAGE_KEY = "promptly-likes";
const SAVES_STORAGE_KEY = "promptly-saves";

/** Every mock prompt/response ships with isLiked: false — nothing is liked by default. */
const INITIAL_LIKED_IDS: string[] = [];

/**
 * Seed set — mirrors the old hardcoded SAVED_PROMPT_IDS the /saved page
 * used before saving was real (same idea as FollowProvider's seed list).
 */
export const INITIAL_SAVED_PROMPT_IDS = ["p3", "p5", "p7", "p11", "p15"];

interface ToggleSetValue {
  isActive: (id: string) => boolean;
  wasInitiallyActive: (id: string) => boolean;
  toggle: (id: string) => void;
}

/**
 * Shared logic behind LikeProvider/SaveProvider: a set of ids toggled on/off
 * and persisted to localStorage, same pattern as FollowProvider. Kept as one
 * internal hook so the two providers below don't duplicate the same ~30
 * lines of storage plumbing.
 */
function useToggleSet(storageKey: string, initialIds: string[]): ToggleSetValue {
  const [ids, setIds] = useState<Set<string>>(() => new Set(initialIds));

  // Static seed above renders on the server and on first client paint (so
  // hydration matches); this effect then swaps in whatever was actually
  // stored last time, same pattern as ThemeProvider/FollowProvider.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // localStorage unavailable or corrupt — keep the seed set.
    }
  }, [storageKey]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // localStorage unavailable — toggle still works for this session.
        }
        return next;
      });
    },
    [storageKey],
  );

  const isActive = useCallback((id: string) => ids.has(id), [ids]);
  const wasInitiallyActive = useCallback((id: string) => initialIds.includes(id), [initialIds]);

  return useMemo(() => ({ isActive, wasInitiallyActive, toggle }), [isActive, wasInitiallyActive, toggle]);
}

interface LikeContextValue {
  isLiked: (id: string) => boolean;
  wasInitiallyLiked: (id: string) => boolean;
  toggleLike: (id: string) => void;
}

const LikeContext = createContext<LikeContextValue | null>(null);

/**
 * Real, working like state for prompts AND request responses (their ids
 * never collide — "p*"/"rr*" — so one id-space covers both), persisted to
 * localStorage. Honest about being this-browser-only: never claims to
 * notify the author or sync anywhere, since there's no backend yet
 * (CLAUDE.md section 2's rule against faking backend actions).
 */
export function LikeProvider({ children }: { children: React.ReactNode }) {
  const { isActive, wasInitiallyActive, toggle } = useToggleSet(LIKES_STORAGE_KEY, INITIAL_LIKED_IDS);

  const value = useMemo(
    () => ({ isLiked: isActive, wasInitiallyLiked: wasInitiallyActive, toggleLike: toggle }),
    [isActive, wasInitiallyActive, toggle],
  );

  return <LikeContext.Provider value={value}>{children}</LikeContext.Provider>;
}

export function useLike() {
  const ctx = useContext(LikeContext);
  if (!ctx) throw new Error("useLike must be used within a LikeProvider");
  return ctx;
}

interface SaveContextValue {
  isSaved: (id: string) => boolean;
  wasInitiallySaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
}

const SaveContext = createContext<SaveContextValue | null>(null);

/** Real, working save state for prompts — same architecture as LikeProvider. */
export function SaveProvider({ children }: { children: React.ReactNode }) {
  const { isActive, wasInitiallyActive, toggle } = useToggleSet(
    SAVES_STORAGE_KEY,
    INITIAL_SAVED_PROMPT_IDS,
  );

  const value = useMemo(
    () => ({ isSaved: isActive, wasInitiallySaved: wasInitiallyActive, toggleSave: toggle }),
    [isActive, wasInitiallyActive, toggle],
  );

  return <SaveContext.Provider value={value}>{children}</SaveContext.Provider>;
}

export function useSave() {
  const ctx = useContext(SaveContext);
  if (!ctx) throw new Error("useSave must be used within a SaveProvider");
  return ctx;
}
