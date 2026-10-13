"use client";

import { useEffect, useState } from "react";

type RelatedState<T> = { key: string; items: T[] | null };

/**
 * Loads a "related" list for the post `key` (its id). `loading` while that post's
 * list is in flight, `failed` when the request errored (callers hide the block —
 * a related list is a nicety, never a reason to break the page). A late answer
 * for a previous post is ignored.
 */
export function useRelated<T>(key: string, load: () => Promise<T[]>): { loading: boolean; failed: boolean; items: T[] } {
  const [state, setState] = useState<RelatedState<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((items) => {
        if (!cancelled) setState({ key, items });
      })
      .catch((err) => {
        console.error("related", err);
        if (!cancelled) setState({ key, items: null });
      });
    return () => {
      cancelled = true;
    };
    // `load` closes over `key`'s post only; re-running on `key` is the intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state && state.key === key ? state : null;
  return { loading: current === null, failed: current !== null && current.items === null, items: current?.items ?? [] };
}
