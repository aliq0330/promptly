"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createRealPrompt,
  fetchPromptById,
  fetchRecentPublishedPrompts,
  updateRealPrompt,
  type CreateRealPromptInput,
  type UpdateRealPromptInput,
} from "@/lib/supabase/prompts";
import type { KeysetCursor } from "@/lib/supabase/pagination";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt, UserProfile } from "@/types";

const PAGE_SIZE = 60;

interface RealPromptsContextValue {
  realPrompts: Prompt[];
  loading: boolean;
  /** Starts the first-page fetch (once). Screens that list prompts call it through `useRealPromptsList`. */
  ensureLoaded: () => void;
  /** Whether a real "load more" page exists beyond what's in `realPrompts` right now. */
  hasMore: boolean;
  loadingMore: boolean;
  /** Fetches and appends the next page (keyset-paginated by `created_at`) — a no-op while already loading or once `hasMore` is false. */
  loadMore: () => Promise<void>;
  getCached: (id: string) => Prompt | undefined;
  fetchById: (id: string) => Promise<Prompt | null>;
  addPrompt: (input: CreateRealPromptInput, authorProfile: UserProfile) => Promise<Prompt>;
  updatePrompt: (id: string, input: UpdateRealPromptInput) => Promise<Prompt>;
}

const RealPromptsContext = createContext<RealPromptsContextValue | null>(null);

/**
 * Every prompt in the app is a real, cross-user, cross-device row in
 * Supabase's `prompts` table. Fetches the most recent published prompts
 * once on mount so they can be mixed into the feed/discover pages, with a
 * real `loadMore()` (keyset pagination, CLAUDE.md's "tam sayfalama"
 * follow-up) that appends further pages on request instead of ever
 * re-fetching from the top. `addPrompt` publishes originals and request
 * answers (`requestId`) alike.
 */
export function RealPromptsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [realPrompts, setRealPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const cursorRef = useRef<KeysetCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // The first page is fetched only when a screen that LISTS prompts asks for it (`useRealPromptsList`): this provider wraps
  // every (app) route, and fetching 60 prompts (+ media, tags, profiles) on every page load was pure waste for the pages that
  // only look a single prompt up (docs/history/325-*). `getCached` / `fetchById` do not depend on the list.
  const startedRef = useRef(false);
  const ensureLoaded = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    fetchRecentPublishedPrompts(PAGE_SIZE)
      .then((page) => {
        setRealPrompts((prev) => {
          // A prompt added/updated while this request was in flight stays; the page fills in the rest.
          const seen = new Set(prev.map((p) => p.id));
          return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
        });
        cursorRef.current = page.nextCursor;
        setHasMore(page.nextCursor !== null);
      })
      .catch(() => {
        startedRef.current = false;
      })
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(async () => {
    // `loadingRef` (not the `loadingMore` state) guards this — two clicks
    // dispatched in the same tick both close over the same pre-render
    // `loadMore` function, so a state-only guard can't see the first
    // click's in-flight request yet. The ref is checked synchronously, so
    // the second call bails out immediately regardless of render timing.
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchRecentPublishedPrompts(PAGE_SIZE, cursorRef.current);
      setRealPrompts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((p) => !seen.has(p.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const getCached = useCallback(
    (id: string) => realPrompts.find((prompt) => prompt.id === id),
    [realPrompts],
  );

  const fetchById = useCallback(
    async (id: string) => {
      const cached = realPrompts.find((prompt) => prompt.id === id);
      if (cached) return cached;
      return fetchPromptById(id);
    },
    [realPrompts],
  );

  const addPrompt = useCallback(
    async (input: CreateRealPromptInput, authorProfile: UserProfile) => {
      if (!user) throw new Error(t("prompt.loginRequiredToPublish"));
      const prompt = await createRealPrompt(input, user.id, authorProfile);
      if (prompt.status === "published") setRealPrompts((prev) => [prompt, ...prev]);
      return prompt;
    },
    [user, t],
  );

  const updatePrompt = useCallback(
    async (id: string, input: UpdateRealPromptInput) => {
      if (!user) throw new Error(t("prompt.loginRequiredToEdit"));
      const prompt = await updateRealPrompt(id, user.id, input);
      setRealPrompts((prev) => {
        if (prev.some((p) => p.id === id)) return prev.map((p) => (p.id === id ? prompt : p));
        return input.publish ? [prompt, ...prev] : prev;
      });
      return prompt;
    },
    [user, t],
  );

  const value = useMemo(
    () => ({ realPrompts, loading, ensureLoaded, hasMore, loadingMore, loadMore, getCached, fetchById, addPrompt, updatePrompt }),
    [realPrompts, loading, ensureLoaded, hasMore, loadingMore, loadMore, getCached, fetchById, addPrompt, updatePrompt],
  );

  return <RealPromptsContext.Provider value={value}>{children}</RealPromptsContext.Provider>;
}

export function useRealPrompts() {
  const ctx = useContext(RealPromptsContext);
  if (!ctx) throw new Error("useRealPrompts must be used within a RealPromptsProvider");
  return ctx;
}

/** Same as `useRealPrompts`, for a screen that shows the prompt LIST: it also starts the (lazy) first-page fetch. */
export function useRealPromptsList() {
  const ctx = useRealPrompts();
  const { ensureLoaded } = ctx;
  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);
  return ctx;
}
