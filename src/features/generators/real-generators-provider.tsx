"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchRecentPublishedGenerators, fetchTopGenerators } from "@/lib/supabase/generators";
import type { KeysetCursor } from "@/lib/supabase/pagination";
import type { Generator } from "@/types";

const PAGE_SIZE = 60;

interface RealGeneratorsContextValue {
  realGenerators: Generator[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  getCached: (id: string) => Generator | undefined;
  removeFromCache: (id: string) => void;
}

const RealGeneratorsContext = createContext<RealGeneratorsContextValue | null>(null);

/**
 * Real, cross-user, cross-device generators — the same `RealPromptsProvider`/
 * `RealRequestsProvider` shape (a shared, app-wide cache instead of each
 * feed/discover surface running its own duplicate fetch), backed by the
 * actual Supabase `generators` table. Bölüm 9.36's Prompt/Generator parity
 * pass: the home feed (`/`) and `/discover` need a real generator source to
 * include generators alongside prompts/requests (§11/§12), and
 * `GeneratorsDiscoverView`'s own two ad hoc fetches fold into this same
 * cache instead of staying a third, independent copy of the same data.
 */
export function RealGeneratorsProvider({ children }: { children: React.ReactNode }) {
  const [realGenerators, setRealGenerators] = useState<Generator[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const cursorRef = useRef<KeysetCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchTopGenerators(60), fetchRecentPublishedGenerators(PAGE_SIZE)]).then(([top, recentPage]) => {
      if (cancelled) return;
      const byId = new Map<string, Generator>();
      for (const generator of [...top, ...recentPage.items]) byId.set(generator.id, generator);
      setRealGenerators(Array.from(byId.values()));
      cursorRef.current = recentPage.nextCursor;
      setHasMore(recentPage.nextCursor !== null);
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
      const page = await fetchRecentPublishedGenerators(PAGE_SIZE, cursorRef.current);
      setRealGenerators((prev) => {
        const seen = new Set(prev.map((g) => g.id));
        return [...prev, ...page.items.filter((g) => !seen.has(g.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const getCached = useCallback((id: string) => realGenerators.find((generator) => generator.id === id), [realGenerators]);

  const removeFromCache = useCallback((id: string) => {
    setRealGenerators((prev) => prev.filter((generator) => generator.id !== id));
  }, []);

  const value = useMemo(
    () => ({ realGenerators, hasMore, loadingMore, loadMore, getCached, removeFromCache }),
    [realGenerators, hasMore, loadingMore, loadMore, getCached, removeFromCache],
  );

  return <RealGeneratorsContext.Provider value={value}>{children}</RealGeneratorsContext.Provider>;
}

export function useRealGenerators() {
  const ctx = useContext(RealGeneratorsContext);
  if (!ctx) throw new Error("useRealGenerators must be used within a RealGeneratorsProvider");
  return ctx;
}
