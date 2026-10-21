"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchForYouPage, type FeedCursor, type FeedEntry, type ForYouReason } from "@/lib/supabase/feed";
import { cameFromHistory } from "@/lib/history-navigation";
import type { FeedQuery } from "./use-feed-pages";

type ForYouQuery = Pick<FeedQuery, "kind" | "taxonomy">;

interface ForYouState {
  key: string;
  asOf: string;
  items: FeedEntry[];
  reasons: Record<string, ForYouReason>;
  cursor: FeedCursor | null;
  failed: boolean;
  loadingMore: boolean;
}

/** Back-button memory, as in `useFeedPages` (docs/history/209-*). */
let historyMemory: ForYouState | null = null;

/**
 * "Sana özel" (`fetchForYouPage`): the same server-driven keyset paging as `useFeedPages`, with two differences.
 * The ranking is frozen at `asOf` for the session (so paging never skips or repeats a post), and a new query — another
 * filter, or `refresh()` after the interests changed — keeps the previous list on screen (`refreshing`) until the new
 * one arrives, so the cards can glide into their new places instead of blinking through a skeleton.
 */
export function useForYouPages(query: ForYouQuery, enabled: boolean) {
  const [asOf, setAsOf] = useState(() =>
    cameFromHistory() && historyMemory ? historyMemory.asOf : new Date().toISOString(),
  );
  const { kind, taxonomy } = query;
  const key = `${asOf}|${kind}|${taxonomy.contentType}|${taxonomy.category}|${taxonomy.subcategory}`;
  const [state, setState] = useState<ForYouState | null>(() =>
    cameFromHistory() && historyMemory && historyMemory.key === key ? { ...historyMemory, loadingMore: false } : null,
  );
  const restoredKey = useRef(state?.key ?? null);

  useEffect(() => {
    if (state && !state.loadingMore && !state.failed) historyMemory = state;
  }, [state]);

  useEffect(() => {
    if (!enabled) return;
    if (restoredKey.current === key) {
      restoredKey.current = null;
      return;
    }
    restoredKey.current = null;
    let cancelled = false;
    fetchForYouPage({ asOf, kind, taxonomy })
      .then((page) => {
        if (!cancelled) setState({ key, asOf, items: page.items, reasons: page.reasons, cursor: page.nextCursor, failed: false, loadingMore: false });
      })
      .catch((err) => {
        console.error("fetchForYouPage", err);
        if (!cancelled) setState({ key, asOf, items: [], reasons: {}, cursor: null, failed: true, loadingMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, asOf, kind, taxonomy]);

  const current = enabled ? state : null;
  const fresh = current?.key === key;

  const loadMore = useCallback(async () => {
    if (!current || !fresh || !current.cursor || current.loadingMore) return;
    const cursor = current.cursor;
    setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await fetchForYouPage({ asOf, kind, taxonomy, cursor });
      setState((prev) => {
        if (!prev || prev.key !== key) return prev;
        const seen = new Set(prev.items.map((item) => `${item.kind}-${item.data.id}`));
        const added = page.items.filter((item) => !seen.has(`${item.kind}-${item.data.id}`));
        return { ...prev, items: [...prev.items, ...added], reasons: { ...prev.reasons, ...page.reasons }, cursor: page.nextCursor, loadingMore: false };
      });
    } catch (err) {
      console.error("fetchForYouPage (load more)", err);
      setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: false, failed: true } : prev));
    }
  }, [current, fresh, key, asOf, kind, taxonomy]);

  return {
    items: current?.items ?? [],
    reasons: current?.reasons ?? {},
    /** Nothing to show yet (first load). */
    loading: enabled && current === null,
    /** A new query is on its way; the previous list stays on screen meanwhile. */
    refreshing: enabled && current !== null && !fresh,
    failed: fresh ? current.failed : false,
    hasMore: fresh ? Boolean(current.cursor) : false,
    loadingMore: fresh ? current.loadingMore : false,
    loadMore,
    /** Re-rank from the top as of now (after the interests changed, or "Tekrar dene"). */
    refresh: useCallback(() => setAsOf(new Date().toISOString()), []),
  };
}
