"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchForYouPage, type FeedCursor, type FeedEntry, type ForYouReason } from "@/lib/supabase/feed";
import { cameFromHistory } from "@/lib/history-navigation";
import { readSnapshot, writeSnapshot } from "@/lib/feed-snapshot";
import { useAuth } from "@/features/auth/auth-provider";
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
  /** Cihazda saklanan son kopya gösteriliyor; gerçek liste yolda (docs/history/466-*). Sayfalama bu sırada kapalıdır. */
  stale: boolean;
}

interface ForYouSnapshot {
  items: FeedEntry[];
  reasons: Record<string, ForYouReason>;
}

/** Back-button memory, as in `useFeedPages` (docs/history/209-*). */
let historyMemory: ForYouState | null = null;

/** Önbellek anahtarı süzgeçlere bağlıdır, `asOf`'a değil: her açılış yeni bir `asOf` alır ama son görülen liste aynı süzgecin listesidir. */
const snapshotKey = (query: ForYouQuery) =>
  `forYou|${query.kind}|${query.taxonomy.contentType ?? ""}|${query.taxonomy.category ?? ""}|${query.taxonomy.subcategory ?? ""}`;

/**
 * "Sana özel" (`fetchForYouPage`): the same server-driven keyset paging as `useFeedPages`, with two differences.
 * The ranking is frozen at `asOf` for the session (so paging never skips or repeats a post), and a new query — another
 * filter, or `refresh()` after the interests changed — keeps the previous list on screen (`refreshing`) until the new
 * one arrives, so the cards can glide into their new places instead of blinking through a skeleton.
 * docs/history/466-*: the first page also opens from the copy saved on this device (`feed-snapshot`) while the real one loads, and stays on
 * screen with a small notice if the real one fails — a slow or stalled server no longer means an empty "could not load" screen.
 */
export function useForYouPages(query: ForYouQuery, enabled: boolean) {
  const { user } = useAuth();
  const owner = user?.id ?? null;
  const [asOf, setAsOf] = useState(() =>
    cameFromHistory() && historyMemory ? historyMemory.asOf : new Date().toISOString(),
  );
  const { kind, taxonomy } = query;
  const key = `${asOf}|${kind}|${taxonomy.contentType}|${taxonomy.category}|${taxonomy.subcategory}`;
  const cacheKey = snapshotKey(query);
  const [state, setState] = useState<ForYouState | null>(() =>
    cameFromHistory() && historyMemory && historyMemory.key === key ? { ...historyMemory, loadingMore: false } : null,
  );
  const restoredKey = useRef(state?.key ?? null);

  useEffect(() => {
    if (state && !state.loadingMore && !state.failed && !state.stale) historyMemory = state;
  }, [state]);

  useEffect(() => {
    if (!enabled) return;
    if (restoredKey.current === key) {
      restoredKey.current = null;
      return;
    }
    restoredKey.current = null;
    let cancelled = false;
    // Saklanan kopya: yalnız ekranda HİÇ liste yokken (sayfanın ilk açılışı) anında gösterilir. Süzgeç değişince ya da "Yenile"de eski davranış
    // sürer: önceki liste yarı saydam kalır, yenisi gelince kartlar yerine kayar.
    const saved = owner ? readSnapshot<ForYouSnapshot>(owner, cacheKey) : null;
    if (saved && saved.data.items.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved copy must be on screen before the network answers
      setState((prev) => prev ?? { key, asOf, items: saved.data.items, reasons: saved.data.reasons ?? {}, cursor: null, failed: false, loadingMore: false, stale: true });
    }
    fetchForYouPage({ asOf, kind, taxonomy })
      .then((page) => {
        if (cancelled) return;
        setState({ key, asOf, items: page.items, reasons: page.reasons, cursor: page.nextCursor, failed: false, loadingMore: false, stale: false });
        if (owner) writeSnapshot<ForYouSnapshot>(owner, cacheKey, { items: page.items, reasons: page.reasons });
      })
      .catch((err) => {
        console.error("fetchForYouPage", err);
        if (cancelled) return;
        // Saklanan kopya ekrandaysa kalır (yalnız "güncellenemedi" notu çıkar); yoksa eskisi gibi hata ekranı.
        setState((prev) =>
          prev && prev.key === key && prev.stale
            ? { ...prev, failed: true }
            : { key, asOf, items: [], reasons: {}, cursor: null, failed: true, loadingMore: false, stale: false },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, key, asOf, kind, taxonomy, owner, cacheKey]);

  const current = enabled ? state : null;
  const fresh = current?.key === key;

  const loadMore = useCallback(async () => {
    if (!current || !fresh || current.stale || !current.cursor || current.loadingMore) return;
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
    /** The saved copy is on screen while the real list loads (or after it failed). */
    stale: fresh ? current.stale : false,
    failed: fresh ? current.failed : false,
    hasMore: fresh && !current.stale ? Boolean(current.cursor) : false,
    loadingMore: fresh ? current.loadingMore : false,
    loadMore,
    /** Re-rank from the top as of now (after the interests changed, or "Tekrar dene"). */
    refresh: useCallback(() => setAsOf(new Date().toISOString()), []),
  };
}
