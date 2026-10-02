"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchContentEngagers,
  type ContentEngager,
  type EngagersCursor,
  type StatisticsContentType,
  type StatisticsKind,
} from "@/lib/supabase/content-statistics";

type Status = "loading" | "ready" | "error";

/**
 * Paginated "who liked / commented on / saved this" list for ONE tab.
 * The first page is fetched lazily the first time the tab is `enabled`
 * (so opening the modal costs one request, not three) and then kept, so
 * switching tabs back and forth never refetches. `loadMore` appends the
 * next keyset page (`nextCursor` from the previous one); a ref guards a
 * double click from requesting the same page twice. A failed FIRST page is
 * an `error` state (retryable), never a fake empty list.
 */
export function useEngagers(
  contentType: StatisticsContentType,
  contentId: string,
  kind: StatisticsKind,
  enabled: boolean,
) {
  const [items, setItems] = useState<ContentEngager[]>([]);
  const [cursor, setCursor] = useState<EngagersCursor | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const startedRef = useRef(false);
  const loadingMoreRef = useRef(false);

  const loadFirst = useCallback(async () => {
    try {
      const page = await fetchContentEngagers(contentType, contentId, kind, null);
      setItems(page.items);
      setCursor(page.nextCursor);
      setStatus("ready");
    } catch (error) {
      console.error("fetchContentEngagers", error);
      setStatus("error");
    }
  }, [contentType, contentId, kind]);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    void loadFirst();
  }, [enabled, loadFirst]);

  const retry = useCallback(() => {
    setStatus("loading");
    void loadFirst();
  }, [loadFirst]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchContentEngagers(contentType, contentId, kind, cursor);
      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.key));
        return [...previous, ...page.items.filter((item) => !seen.has(item.key))];
      });
      setCursor(page.nextCursor);
    } catch (error) {
      console.error("fetchContentEngagers (more)", error);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [cursor, contentType, contentId, kind]);

  return { items, status, hasMore: cursor !== null, loadingMore, loadMore, retry };
}
