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

const PAGE_SIZE = 24;

interface RealPromptsContextValue {
  realPrompts: Prompt[];
  loading: boolean;
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
  const cursorRef = useRef<KeysetCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentPublishedPrompts(PAGE_SIZE).then((page) => {
      if (cancelled) return;
      setRealPrompts(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current) return;
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
      setLoadingMore(false);
    }
  }, [loadingMore]);

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
    () => ({ realPrompts, loading, hasMore, loadingMore, loadMore, getCached, fetchById, addPrompt, updatePrompt }),
    [realPrompts, loading, hasMore, loadingMore, loadMore, getCached, fetchById, addPrompt, updatePrompt],
  );

  return <RealPromptsContext.Provider value={value}>{children}</RealPromptsContext.Provider>;
}

export function useRealPrompts() {
  const ctx = useContext(RealPromptsContext);
  if (!ctx) throw new Error("useRealPrompts must be used within a RealPromptsProvider");
  return ctx;
}
