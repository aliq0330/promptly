"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "promptly-hidden-prompts";

interface HiddenPromptsContextValue {
  isHidden: (promptId: string) => boolean;
  hideCount: number;
  hidePrompt: (promptId: string) => void;
  unhidePrompt: (promptId: string) => void;
}

const HiddenPromptsContext = createContext<HiddenPromptsContextValue | null>(null);

/**
 * "Profilimden gizle" — a real, localStorage-persisted per-browser action
 * (same architecture as FollowProvider/LikeProvider). Deliberately NOT
 * called "Sil" (delete): the mock prompt array is static and there's no
 * backend, so nothing is actually deleted anywhere — the prompt still
 * exists and is still visible everywhere else (feed, detail page, other
 * profiles). This only removes it from the current browser's own view of
 * this profile's gallery, and can be undone from the same browser.
 */
export function HiddenPromptsProvider({ children }: { children: React.ReactNode }) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHiddenIds(new Set(JSON.parse(stored)));
      }
    } catch {
      // localStorage unavailable or corrupt — start with nothing hidden.
    }
  }, []);

  const persist = useCallback((next: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // localStorage unavailable — toggle still works for this session.
    }
  }, []);

  const hidePrompt = useCallback(
    (promptId: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.add(promptId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const unhidePrompt = useCallback(
    (promptId: string) => {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(promptId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const isHidden = useCallback((promptId: string) => hiddenIds.has(promptId), [hiddenIds]);

  const value = useMemo(
    () => ({ isHidden, hideCount: hiddenIds.size, hidePrompt, unhidePrompt }),
    [isHidden, hiddenIds, hidePrompt, unhidePrompt],
  );

  return <HiddenPromptsContext.Provider value={value}>{children}</HiddenPromptsContext.Provider>;
}

export function useHiddenPrompts() {
  const ctx = useContext(HiddenPromptsContext);
  if (!ctx) throw new Error("useHiddenPrompts must be used within a HiddenPromptsProvider");
  return ctx;
}
