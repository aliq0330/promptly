"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchFeedPage, type FeedCursor, type FeedEntry, type FeedPageParams } from "@/lib/supabase/feed";

export type FeedQuery = Omit<FeedPageParams, "limit" | "cursor">;

interface FeedState {
  /** Which query (and retry) this state belongs to — a mismatch means the new query is still loading. */
  key: string;
  items: FeedEntry[];
  cursor: FeedCursor | null;
  failed: boolean;
  loadingMore: boolean;
}

/**
 * Server-driven, keyset-paginated home feed (`fetchFeedPage`): the first page
 * loads whenever the query changes, `loadMore` appends the next page after the
 * cursor of the last RAW row. Nothing is filtered on the client, so there is no
 * pool that a followed author could fall out of.
 *
 * The state remembers which query it answers; while that differs from the
 * current query the hook reports `loading` (no stale list from the previous
 * tab flashes in) and a late response for an old query is ignored.
 */
export function useFeedPages(query: FeedQuery, enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<FeedState | null>(null);
  const key = `${retry}|${query.scope}|${query.order}|${query.kind}|${query.taxonomy.contentType}|${query.taxonomy.category}|${query.taxonomy.subcategory}`;

  const { scope, order, kind, taxonomy } = query;
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchFeedPage({ scope, order, kind, taxonomy })
      .then((page) => {
        if (!cancelled) setState({ key, items: page.items, cursor: page.nextCursor, failed: false, loadingMore: false });
      })
      .catch((err) => {
        console.error("fetchFeedPage", err);
        if (!cancelled) setState({ key, items: [], cursor: null, failed: true, loadingMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, scope, order, kind, taxonomy]);

  const current = enabled && state && state.key === key ? state : null;

  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.loadingMore) return;
    const cursor = current.cursor;
    setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await fetchFeedPage({ scope, order, kind, taxonomy, cursor });
      setState((prev) => {
        if (!prev || prev.key !== key) return prev;
        const seen = new Set(prev.items.map((item) => `${item.kind}-${item.data.id}`));
        const fresh = page.items.filter((item) => !seen.has(`${item.kind}-${item.data.id}`));
        return { ...prev, items: [...prev.items, ...fresh], cursor: page.nextCursor, loadingMore: false };
      });
    } catch (err) {
      console.error("fetchFeedPage (load more)", err);
      setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: false, failed: true } : prev));
    }
  }, [current, key, scope, order, kind, taxonomy]);

  return {
    items: current?.items ?? [],
    loading: enabled && current === null,
    failed: current?.failed ?? false,
    hasMore: Boolean(current?.cursor),
    loadingMore: current?.loadingMore ?? false,
    loadMore,
    retry: () => setRetry((n) => n + 1),
  };
}
