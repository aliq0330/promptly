"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GrowingPage<T> {
  items: T[];
  hasMore: boolean;
}

/**
 * A small queue-like list (community events, reports) read as "the first N rows": `grow()` re-reads with N + step, `reload()` re-reads the
 * same N after an action (RSVP, a decision) so counts and statuses stay true. Unlike `usePagedList` the whole window is re-fetched — fine for
 * lists that stay in the hundreds and are edited in place. A new `key` (scope / filter) starts over at the first step; a late answer of an
 * abandoned request is ignored; a failure keeps what is shown and offers a retry (docs/history/258-*).
 */
export function useGrowingList<T>(key: string, load: (limit: number) => Promise<GrowingPage<T>>, step = 50) {
  const [limit, setLimit] = useState(step);
  const [state, setState] = useState<{ key: string; items: T[]; hasMore: boolean; failed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const loadRef = useRef(load);
  const seq = useRef(0);
  useEffect(() => {
    loadRef.current = load;
  });

  // A new key starts over.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setLimit(step);
    setState(null);
  }, [key, step]);

  const run = useCallback(
    async (size: number) => {
      const mine = ++seq.current;
      busyRef.current = true;
      setBusy(true);
      try {
        const page = await loadRef.current(size);
        if (mine === seq.current) setState({ key, items: page.items, hasMore: page.hasMore, failed: false });
      } catch (err) {
        console.error("useGrowingList", err);
        if (mine === seq.current) setState((prev) => ({ key, items: prev?.key === key ? prev.items : [], hasMore: false, failed: true }));
      } finally {
        if (mine === seq.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [key],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- (re)read the window whenever its size or key changes
    void run(limit);
  }, [run, limit]);

  const current = state && state.key === key ? state : null;
  return {
    items: current?.items ?? null,
    hasMore: current?.hasMore ?? false,
    failed: current?.failed ?? false,
    loading: current === null,
    loadingMore: busy && current !== null,
    // `busy` guards a second trigger (observer + click) from growing the window twice for one reader gesture.
    grow: useCallback(() => {
      if (busyRef.current) return;
      busyRef.current = true;
      setLimit((n) => n + step);
    }, [step]),
    reload: useCallback(() => run(limit), [run, limit]),
    retry: useCallback(() => run(limit), [run, limit]),
  };
}
