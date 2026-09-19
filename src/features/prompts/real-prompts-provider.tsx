"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createRealPrompt,
  fetchPromptById,
  fetchRecentPublishedPrompts,
  type CreateRealPromptInput,
} from "@/lib/supabase/prompts";
import type { Prompt, UserProfile } from "@/types";

interface RealPromptsContextValue {
  realPrompts: Prompt[];
  loading: boolean;
  getCached: (id: string) => Prompt | undefined;
  fetchById: (id: string) => Promise<Prompt | null>;
  addPrompt: (input: CreateRealPromptInput, authorProfile: UserProfile) => Promise<Prompt>;
}

const RealPromptsContext = createContext<RealPromptsContextValue | null>(null);

/**
 * Every prompt in the app is a real, cross-user, cross-device row in
 * Supabase's `prompts` table. Fetches the most recent published prompts
 * once on mount so they can be mixed into the feed/discover pages.
 * `addPrompt` publishes originals, remixes (`remixOf`) and request answers
 * (`requestId`) alike.
 */
export function RealPromptsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [realPrompts, setRealPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentPublishedPrompts().then((prompts) => {
      if (!cancelled) {
        setRealPrompts(prompts);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
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
      if (!user) throw new Error("Giriş yapmadan prompt yayınlanamaz.");
      const prompt = await createRealPrompt(input, user.id, authorProfile);
      setRealPrompts((prev) => [prompt, ...prev]);
      return prompt;
    },
    [user],
  );

  const value = useMemo(
    () => ({ realPrompts, loading, getCached, fetchById, addPrompt }),
    [realPrompts, loading, getCached, fetchById, addPrompt],
  );

  return <RealPromptsContext.Provider value={value}>{children}</RealPromptsContext.Provider>;
}

export function useRealPrompts() {
  const ctx = useContext(RealPromptsContext);
  if (!ctx) throw new Error("useRealPrompts must be used within a RealPromptsProvider");
  return ctx;
}
