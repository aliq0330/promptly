"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchRecentWorkflows } from "@/lib/supabase/workflows";
import type { KeysetCursor } from "@/lib/supabase/pagination";
import type { Workflow } from "@/types";

const PAGE_SIZE = 60;

interface RealWorkflowsContextValue {
  realWorkflows: Workflow[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  getCached: (id: string) => Workflow | undefined;
  removeFromCache: (id: string) => void;
}

const RealWorkflowsContext = createContext<RealWorkflowsContextValue | null>(null);

/**
 * Real, cross-user published workflows — same shape as `RealGeneratorsProvider`
 * (one shared, app-wide cache so the home feed, Discover and `/workflows`
 * don't each run their own duplicate fetch). Workflow is a first-class
 * content type next to prompts, generators and requests. `loadMore()`
 * keyset-paginates by `created_at`/`id` (CLAUDE.md's "tam sayfalama"
 * follow-up) instead of staying capped at a fixed batch.
 */
export function RealWorkflowsProvider({ children }: { children: React.ReactNode }) {
  const [realWorkflows, setRealWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const cursorRef = useRef<KeysetCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentWorkflows(PAGE_SIZE).then((page) => {
      if (cancelled) return;
      setRealWorkflows(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    // See the matching note in `real-prompts-provider.tsx` — `loadingRef`
    // (not the `loadingMore` state) guards against a same-tick double-click.
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchRecentWorkflows(PAGE_SIZE, cursorRef.current);
      setRealWorkflows((prev) => {
        const seen = new Set(prev.map((w) => w.id));
        return [...prev, ...page.items.filter((w) => !seen.has(w.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const getCached = useCallback((id: string) => realWorkflows.find((workflow) => workflow.id === id), [realWorkflows]);
  const removeFromCache = useCallback((id: string) => {
    setRealWorkflows((prev) => prev.filter((workflow) => workflow.id !== id));
  }, []);

  const value = useMemo(
    () => ({ realWorkflows, loading, hasMore, loadingMore, loadMore, getCached, removeFromCache }),
    [realWorkflows, loading, hasMore, loadingMore, loadMore, getCached, removeFromCache],
  );
  return <RealWorkflowsContext.Provider value={value}>{children}</RealWorkflowsContext.Provider>;
}

export function useRealWorkflows() {
  const ctx = useContext(RealWorkflowsContext);
  if (!ctx) throw new Error("useRealWorkflows must be used within a RealWorkflowsProvider");
  return ctx;
}
