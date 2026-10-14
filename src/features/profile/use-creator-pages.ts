"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchCreatorsPage, type CreatorCursor } from "@/lib/supabase/profiles";
import type { UserProfile } from "@/types";

interface CreatorsState {
  /** Which attempt (retry counter) this state belongs to — a mismatch means the retry is still loading. */
  key: number;
  creators: UserProfile[];
  cursor: CreatorCursor | null;
  failed: boolean;
  loadingMore: boolean;
}

/**
 * Keşfet's "Yaratıcılar" list: keyset-paginated (`fetchCreatorsPage`) with the
 * same contract as `useFeedPages` — first page, `loadMore`, a late response of
 * an abandoned attempt is ignored, and a failure offers a retry instead of a
 * false empty list. This is NOT `feed_page` (creators are profiles).
 */
export function useCreatorPages(enabled: boolean) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<CreatorsState | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchCreatorsPage()
      .then((page) => {
        if (!cancelled) setState({ key: retry, creators: page.creators, cursor: page.nextCursor, failed: false, loadingMore: false });
      })
      .catch((err) => {
        console.error("fetchCreatorsPage", err);
        if (!cancelled) setState({ key: retry, creators: [], cursor: null, failed: true, loadingMore: false });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, retry]);

  const current = enabled && state && state.key === retry ? state : null;

  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.loadingMore) return;
    const cursor = current.cursor;
    setState((prev) => (prev && prev.key === retry ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await fetchCreatorsPage(cursor);
      setState((prev) => {
        if (!prev || prev.key !== retry) return prev;
        const seen = new Set(prev.creators.map((creator) => creator.id));
        return { ...prev, creators: [...prev.creators, ...page.creators.filter((creator) => !seen.has(creator.id))], cursor: page.nextCursor, loadingMore: false };
      });
    } catch (err) {
      console.error("fetchCreatorsPage (load more)", err);
      setState((prev) => (prev && prev.key === retry ? { ...prev, loadingMore: false, failed: true } : prev));
    }
  }, [current, retry]);

  return {
    creators: current?.creators ?? [],
    loading: enabled && current === null,
    failed: current?.failed ?? false,
    hasMore: Boolean(current?.cursor),
    loadingMore: current?.loadingMore ?? false,
    loadMore,
    retry: () => setRetry((n) => n + 1),
  };
}
