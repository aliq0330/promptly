"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PagedResult } from "@/lib/supabase/paged";

interface PagedState<T> {
  /** Which query (and retry) this state answers — a mismatch means the new query is still loading. */
  key: string;
  items: T[];
  total: number | null;
  nextOffset: number | null;
  failed: boolean;
  loadingMore: boolean;
}

/**
 * A list read one page at a time (profile "Promptlar" / "Beğeniler", "İçeriklerim"): the first page loads whenever `key` changes (the
 * filters / sort / search it answers), `loadMore` appends the next one. Same contract as `useFeedPages`: while the state answers another
 * key the hook reports `loading` (no stale list flashes in), a late response of an abandoned query is ignored, and a failure offers a retry
 * instead of a false empty list. `load` is read through a ref, so callers pass an inline closure.
 */
export function usePagedList<T>(
  key: string,
  enabled: boolean,
  load: (offset: number) => Promise<PagedResult<T>>,
  /** What makes two rows the same one (a page boundary can repeat a row). Default: the row's `id`. */
  keyOf: (item: T) => string = (item) => (item as unknown as { id: string }).id,
) {
  const [retry, setRetry] = useState(0);
  const fullKey = `${retry}|${key}`;
  const [state, setState] = useState<PagedState<T> | null>(null);
  const loadRef = useRef(load);
  const keyOfRef = useRef(keyOf);
  useEffect(() => {
    loadRef.current = load;
    keyOfRef.current = keyOf;
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadRef
      .current(0)
      .then((page) => {
        if (!cancelled) setState({ key: fullKey, items: page.items, total: page.total, nextOffset: page.nextOffset, failed: false, loadingMore: false });
      })
      .catch((err) => {
        console.error("usePagedList", err);
        if (!cancelled) setState({ key: fullKey, items: [], total: null, nextOffset: null, failed: true, loadingMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, fullKey]);

  const current = enabled && state && state.key === fullKey ? state : null;

  const loadMore = useCallback(async () => {
    if (current?.nextOffset == null || current.loadingMore) return;
    const offset = current.nextOffset;
    setState((prev) => (prev && prev.key === fullKey ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await loadRef.current(offset);
      setState((prev) => {
        if (!prev || prev.key !== fullKey) return prev;
        const seen = new Set(prev.items.map((item) => keyOfRef.current(item)));
        return { ...prev, items: [...prev.items, ...page.items.filter((item) => !seen.has(keyOfRef.current(item)))], nextOffset: page.nextOffset, loadingMore: false };
      });
    } catch (err) {
      console.error("usePagedList (load more)", err);
      setState((prev) => (prev && prev.key === fullKey ? { ...prev, loadingMore: false, failed: true } : prev));
    }
  }, [current, fullKey]);

  /** Drops one row (by its key) after it was deleted; the total follows. */
  const removeItem = useCallback(
    (id: string) =>
      setState((prev) => {
        if (!prev || !prev.items.some((item) => keyOfRef.current(item) === id)) return prev;
        return { ...prev, items: prev.items.filter((item) => keyOfRef.current(item) !== id), total: prev.total == null ? null : Math.max(0, prev.total - 1) };
      }),
    [],
  );

  return {
    items: current?.items ?? [],
    /** Counted with the first page (`null` until then / when the server did not count). */
    total: current?.total ?? null,
    loading: enabled && current === null,
    failed: current?.failed ?? false,
    hasMore: current?.nextOffset != null,
    loadingMore: current?.loadingMore ?? false,
    loadMore,
    retry: () => setRetry((n) => n + 1),
    removeItem,
  };
}
