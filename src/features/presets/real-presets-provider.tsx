"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchRecentPresets } from "@/lib/supabase/presets";
import type { KeysetCursor } from "@/lib/supabase/pagination";
import type { Preset } from "@/types";

const PAGE_SIZE = 60;

interface RealPresetsContextValue {
  realPresets: Preset[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  getCached: (id: string) => Preset | undefined;
  removeFromCache: (id: string) => void;
  /** Re-fetches the first page (e.g. right after the user saved a new preset). */
  reload: () => void;
}

const RealPresetsContext = createContext<RealPresetsContextValue | null>(null);

/**
 * Real, cross-user published presets — same shape as `RealGeneratorsProvider`
 * (one shared, app-wide cache so the home feed, Discover and `/presets`
 * don't each run their own duplicate fetch). Preset is a first-class
 * content type next to prompts, generators and requests. `loadMore()`
 * keyset-paginates by `created_at`/`id` (CLAUDE.md's "tam sayfalama"
 * follow-up) instead of staying capped at a fixed batch.
 */
export function RealPresetsProvider({ children }: { children: React.ReactNode }) {
  const [realPresets, setRealPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const cursorRef = useRef<KeysetCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchRecentPresets(PAGE_SIZE).then((page) => {
      if (cancelled) return;
      setRealPresets(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  const loadMore = useCallback(async () => {
    // See the matching note in `real-prompts-provider.tsx` — `loadingRef`
    // (not the `loadingMore` state) guards against a same-tick double-click.
    if (loadingRef.current || !cursorRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchRecentPresets(PAGE_SIZE, cursorRef.current);
      setRealPresets((prev) => {
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

  const getCached = useCallback((id: string) => realPresets.find((preset) => preset.id === id), [realPresets]);
  const removeFromCache = useCallback((id: string) => {
    setRealPresets((prev) => prev.filter((preset) => preset.id !== id));
  }, []);

  const value = useMemo(
    () => ({ realPresets, loading, hasMore, loadingMore, loadMore, getCached, removeFromCache, reload }),
    [realPresets, loading, hasMore, loadingMore, loadMore, getCached, removeFromCache, reload],
  );
  return <RealPresetsContext.Provider value={value}>{children}</RealPresetsContext.Provider>;
}

export function useRealPresets() {
  const ctx = useContext(RealPresetsContext);
  if (!ctx) throw new Error("useRealPresets must be used within a RealPresetsProvider");
  return ctx;
}
