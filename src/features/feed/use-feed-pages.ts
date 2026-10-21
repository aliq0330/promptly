"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeedPage, type FeedCursor, type FeedEntry, type FeedPageParams } from "@/lib/supabase/feed";
import { cameFromHistory } from "@/lib/history-navigation";

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
 * The last state of each query, for the browser's Back button only (`cameFromHistory`): the list comes back exactly as it
 * was (every loaded page), so the restored scroll position has its posts under it and a cover can shrink back into its
 * card (docs/history/209-*). Any other arrival loads fresh. Small and in memory; a reload empties it.
 */
const HISTORY_MAX = 12;
const historyMemory = new Map<string, FeedState>();
const queryPart = (key: string) => key.slice(key.indexOf("|") + 1);

function remember(state: FeedState) {
  const part = queryPart(state.key);
  historyMemory.delete(part);
  historyMemory.set(part, state);
  if (historyMemory.size > HISTORY_MAX) historyMemory.delete(historyMemory.keys().next().value as string);
}

/**
 * Server-driven, keyset-paginated feed (`fetchFeedPage`) behind Home AND Keşfet: the first page
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
  const key = `${retry}|${query.scope}|${query.order}|${query.kind}|${query.taxonomy.contentType}|${query.taxonomy.category}|${query.taxonomy.subcategory}|${query.openOnly ? 1 : 0}|${query.tag ?? ""}|${query.tool ?? ""}`;
  const [state, setState] = useState<FeedState | null>(() => {
    if (!cameFromHistory()) return null;
    const kept = historyMemory.get(queryPart(key));
    return kept && !kept.failed ? { ...kept, key, loadingMore: false } : null;
  });
  // The first effect run must not refetch a list that was just put back.
  const restoredKey = useRef(state?.key ?? null);

  useEffect(() => {
    if (state && !state.loadingMore && !state.failed) remember(state);
  }, [state]);

  const { scope, order, kind, taxonomy, openOnly, tag, tool } = query;
  useEffect(() => {
    if (!enabled) return;
    if (restoredKey.current === key) {
      restoredKey.current = null;
      return;
    }
    restoredKey.current = null;
    let cancelled = false;
    fetchFeedPage({ scope, order, kind, taxonomy, openOnly, tag, tool })
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
  }, [enabled, key, scope, order, kind, taxonomy, openOnly, tag, tool]);

  const current = enabled && state && state.key === key ? state : null;

  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.loadingMore) return;
    const cursor = current.cursor;
    setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await fetchFeedPage({ scope, order, kind, taxonomy, openOnly, tag, tool, cursor });
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
  }, [current, key, scope, order, kind, taxonomy, openOnly, tag, tool]);

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
