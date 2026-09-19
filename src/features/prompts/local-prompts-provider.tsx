"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getUserById } from "@/mocks/users";
import type { Prompt, PromptContentType, PromptMedia, PromptOrigin, Tag } from "@/types";

const STORAGE_KEY = "promptly-local-prompts";

export interface NewLocalPromptInput {
  title: string;
  description: string;
  promptText: string;
  tool: string | null;
  contentType: PromptContentType;
  media: PromptMedia[];
  tags: Tag[];
  origin: PromptOrigin;
}

interface LocalPromptsContextValue {
  localPrompts: Prompt[];
  getById: (id: string) => Prompt | undefined;
  getByAuthor: (userId: string) => Prompt[];
  getForRequest: (requestId: string) => Prompt[];
  addPrompt: (input: NewLocalPromptInput) => Prompt;
}

const LocalPromptsContext = createContext<LocalPromptsContextValue | null>(null);

/**
 * Real, working prompt publishing — but scoped narrowly (see CLAUDE.md's
 * prompt-request module notes): only the "answer a request" flow in
 * CreatePromptForm actually calls `addPrompt` and persists here. Plain
 * "Prompt oluştur" (and remix/duplicate prefill) keep their existing,
 * explicitly-documented preview-only behavior — CLAUDE.md section 2 says
 * not to change working, already-approved behavior without being asked,
 * and this module's ask is specifically about requests/answers, not a
 * general "make publishing real" change.
 *
 * Ids are prefixed `local-` — `promptHref()` in lib/utils.ts uses that
 * prefix to route to `/prompts/local?id=…` instead of the static
 * `/prompts/[id]` pages, which can't serve paths that didn't exist at
 * build time (GitHub Pages static export).
 */
export function LocalPromptsProvider({ children }: { children: React.ReactNode }) {
  const [localPrompts, setLocalPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalPrompts(JSON.parse(stored));
      }
    } catch {
      // localStorage unavailable or corrupt — start with none.
    }
  }, []);

  const addPrompt = useCallback((input: NewLocalPromptInput): Prompt => {
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    // A request-response origin's responseId is the answer prompt itself
    // (there's no separate response entity anymore, see CreatePromptForm's
    // answerRequest mode) — fill it in now that `id` is known.
    const origin: PromptOrigin =
      input.origin.type === "request-response" ? { ...input.origin, responseId: id } : input.origin;

    const prompt: Prompt = {
      id,
      author: getUserById("me")!,
      title: input.title.trim(),
      description: input.description.trim(),
      promptText: input.promptText.trim(),
      tool: input.tool,
      contentType: input.contentType,
      media: input.media,
      tags: input.tags,
      origin,
      likeCount: 0,
      commentCount: 0,
      remixCount: 0,
      isLiked: false,
      isSaved: false,
      status: "published",
      createdAt: new Date().toISOString(),
    };

    setLocalPrompts((prev) => {
      const next = [...prev, prompt];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable — prompt still shows for this session.
      }
      return next;
    });

    return prompt;
  }, []);

  const getById = useCallback(
    (id: string) => localPrompts.find((prompt) => prompt.id === id),
    [localPrompts],
  );
  const getByAuthor = useCallback(
    (userId: string) => localPrompts.filter((prompt) => prompt.author.id === userId),
    [localPrompts],
  );
  const getForRequest = useCallback(
    (requestId: string) =>
      localPrompts.filter(
        (prompt) => prompt.origin.type === "request-response" && prompt.origin.requestId === requestId,
      ),
    [localPrompts],
  );

  const value = useMemo(
    () => ({ localPrompts, getById, getByAuthor, getForRequest, addPrompt }),
    [localPrompts, getById, getByAuthor, getForRequest, addPrompt],
  );

  return <LocalPromptsContext.Provider value={value}>{children}</LocalPromptsContext.Provider>;
}

export function useLocalPrompts() {
  const ctx = useContext(LocalPromptsContext);
  if (!ctx) throw new Error("useLocalPrompts must be used within a LocalPromptsProvider");
  return ctx;
}
