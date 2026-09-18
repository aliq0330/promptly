"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getUserById } from "@/mocks/users";
import type { PromptComment } from "@/types";

const STORAGE_KEY = "promptly-local-comments";

/** A comment target is either a prompt or a request — never both. */
export type CommentTarget = { promptId: string } | { requestId: string };

function matchesTarget(comment: PromptComment, target: CommentTarget): boolean {
  return "promptId" in target
    ? comment.promptId === target.promptId
    : comment.requestId === target.requestId;
}

interface CommentContextValue {
  getLocalComments: (target: CommentTarget) => PromptComment[];
  addComment: (target: CommentTarget, body: string, parentId?: string | null) => void;
}

const CommentContext = createContext<CommentContextValue | null>(null);

/**
 * Genuinely-working local comment posting, persisted to localStorage like
 * follows/likes/saves. Authored as the "me" mock user — honest about being
 * this-browser-only, never claims to notify the author or sync to other
 * users since there's no backend yet (CLAUDE.md sections 2, 17-21).
 *
 * Shared between prompt detail pages and request detail pages (CLAUDE.md
 * prompt-request module) — the same comment UI, storage, and rules apply
 * to both, distinguished only by which of `promptId`/`requestId` a target
 * carries.
 */
export function CommentProvider({ children }: { children: React.ReactNode }) {
  const [localComments, setLocalComments] = useState<PromptComment[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalComments(JSON.parse(stored));
      }
    } catch {
      // localStorage unavailable or corrupt — start empty.
    }
  }, []);

  const addComment = useCallback(
    (target: CommentTarget, body: string, parentId: string | null = null) => {
      const trimmed = body.trim();
      if (!trimmed) return;

      const comment: PromptComment = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...target,
        author: getUserById("me")!,
        body: trimmed,
        parentId,
        createdAt: new Date().toISOString(),
      };

      setLocalComments((prev) => {
        const next = [...prev, comment];
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // localStorage unavailable — comment still shows for this session.
        }
        return next;
      });
    },
    [],
  );

  const getLocalComments = useCallback(
    (target: CommentTarget) => localComments.filter((comment) => matchesTarget(comment, target)),
    [localComments],
  );

  const value = useMemo(() => ({ getLocalComments, addComment }), [getLocalComments, addComment]);

  return <CommentContext.Provider value={value}>{children}</CommentContext.Provider>;
}

export function useComments() {
  const ctx = useContext(CommentContext);
  if (!ctx) throw new Error("useComments must be used within a CommentProvider");
  return ctx;
}
