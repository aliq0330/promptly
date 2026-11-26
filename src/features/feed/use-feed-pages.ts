"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFeedPage, type FeedCursor, type FeedEntry, type FeedPageParams } from "@/lib/supabase/feed";
import { cameFromHistory } from "@/lib/history-navigation";
import { readSnapshot, writeSnapshot } from "@/lib/feed-snapshot";
import { useAuth } from "@/features/auth/auth-provider";

export type FeedQuery = Omit<FeedPageParams, "limit" | "cursor">;

/** Order-independent text of a filter set (the same chips picked in another order are the same query). */
const setKey = (values: string[] | undefined) => (values?.length ? [...values].sort().join(",") : "");

interface FeedState {
  /** Which query (and retry) this state belongs to — a mismatch means the new query is still loading. */
  key: string;
  items: FeedEntry[];
  cursor: FeedCursor | null;
  failed: boolean;
  loadingMore: boolean;
  /** Cihazda saklanan son ilk sayfa gösteriliyor, gerçeği yolda (docs/history/466-*); bu sırada sayfalama kapalı. */
  stale?: boolean;
}

/**
 * The last state of each query, for the browser's Back button only (`cameFromHistory`): the list comes back exactly as it
 * was (every loaded page), so the restored scroll position has its posts under it and a cover can shrink back into its
 * card (docs/history/209-*). Any other arrival loads fresh. Small and in memory; a reload empties it.
 */
const HISTORY_MAX = 12;
/** "N yeni gönderi" yoklama aralığı. */
const NEW_POSTS_POLL_MS = 45_000;
/** Sekme yeniden görününce yoklama için son yoklamadan bu kadar geçmiş olmalı (art arda görünür/gizli geçişleri sorgu yağdırmasın). */
const NEW_POSTS_VISIBLE_MIN_MS = 2_000;
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
export function useFeedPages(query: FeedQuery, enabled: boolean, { watchNew = false, snapshot = true }: { watchNew?: boolean; snapshot?: boolean } = {}) {
  const { user } = useAuth();
  const owner = user?.id ?? null;
  const [retry, setRetry] = useState(0);
  // "N yeni gönderi" (docs/history/435-*): yeni gelenler okuyucunun listesini kaydırmadan sayılır; `showNew` listeyi yerinde yeniler.
  const [fresh, setFresh] = useState<{ key: string; count: number; plus: boolean }>({ key: "", count: 0, plus: false });
  const key = `${retry}|${query.scope}|${query.order}|${query.kind}|${query.taxonomy.contentType}|${query.taxonomy.category}|${query.taxonomy.subcategory}|${query.openOnly ? 1 : 0}|${query.hasMedia ? 1 : 0}|${query.tag ?? ""}|${query.tool ?? ""}|${setKey(query.authors)}|${setKey(query.tags)}|${setKey(query.tools)}`;
  const [state, setState] = useState<FeedState | null>(() => {
    if (!cameFromHistory()) return null;
    const kept = historyMemory.get(queryPart(key));
    return kept && !kept.failed ? { ...kept, key, loadingMore: false } : null;
  });
  // The first effect run must not refetch a list that was just put back.
  const restoredKey = useRef(state?.key ?? null);

  useEffect(() => {
    if (state && !state.loadingMore && !state.failed && !state.stale) remember(state);
  }, [state]);

  const { scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool, authors, tags, tools } = query;
  // Önbellek anahtarı = sorgunun kendisi ("Tekrar dene" sayacı hariç); kişiye göre ayrılır (`feed-snapshot`).
  const cacheKey = `feed|${queryPart(key)}`;
  useEffect(() => {
    if (!enabled) return;
    if (restoredKey.current === key) {
      restoredKey.current = null;
      return;
    }
    restoredKey.current = null;
    let cancelled = false;
    // docs/history/466-*: bu sorgunun listesi ekranda yokken cihazdaki son ilk sayfa anında gösterilir; gerçek sayfa gelince yerini alır.
    // "Tekrar dene"de (retry) ve başka bir sorgudan geçerken de kullanılır: eski davranış iskeletti, artık son görülen liste.
    const saved = snapshot ? readSnapshot<FeedEntry[]>(owner, cacheKey) : null;
    if (saved && saved.data.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved copy must be on screen before the network answers
      setState((prev) => (prev && prev.key === key && !prev.failed ? prev : { key, items: saved.data, cursor: null, failed: false, loadingMore: false, stale: true }));
    }
    fetchFeedPage({ scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool, authors, tags, tools })
      .then((page) => {
        if (cancelled) return;
        setState({ key, items: page.items, cursor: page.nextCursor, failed: false, loadingMore: false, stale: false });
        if (snapshot) writeSnapshot(owner, cacheKey, page.items);
      })
      .catch((err) => {
        console.error("fetchFeedPage", err);
        if (cancelled) return;
        // Saklanan liste ekrandaysa kalır (yalnız "yüklenemedi" satırı); yoksa eskisi gibi hata ekranı.
        setState((prev) => (prev && prev.key === key && prev.stale ? { ...prev, failed: true } : { key, items: [], cursor: null, failed: true, loadingMore: false }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already carries the filter sets by value (the arrays are new on every render)
  }, [enabled, key, scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool, owner, cacheKey, snapshot]);

  const current = enabled && state && state.key === key ? state : null;

  // Yeni gönderi kolluğu: yalnız en yeni sıralı, ilk sayfası yüklenmiş listede; sekme görünürken 45 sn'de bir ve sekme yeniden görününce ilk sayfa okunur, listede
  // olmayan en yeni kayıtlar sayılır (ilk BİLİNEN kayda kadar). Hata sessizdir (kolluk listeyi bozmamalı). Sayfa açılışında ek sorgu yoktur: ilk yoklama 45 sn sonra.
  const itemsRef = useRef<FeedEntry[]>([]);
  useEffect(() => {
    itemsRef.current = current?.items ?? [];
  }, [current]);
  const watching = watchNew && order === "newest" && current !== null && !current.failed && !current.stale;
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let last = 0;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      last = Date.now();
      try {
        const page = await fetchFeedPage({ scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool, authors, tags, tools });
        if (cancelled) return;
        const known = new Set(itemsRef.current.map((item) => `${item.kind}-${item.data.id}`));
        let count = 0;
        for (const item of page.items) {
          if (known.has(`${item.kind}-${item.data.id}`)) break;
          count += 1;
        }
        setFresh({ key, count, plus: count > 0 && count === page.items.length });
      } catch {
        // Sessiz: bir sonraki yoklamada yeniden denenir.
      }
    };
    const timer = window.setInterval(() => void poll(), NEW_POSTS_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last > NEW_POSTS_VISIBLE_MIN_MS) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` carries the filter sets by value
  }, [watching, key, scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool]);

  /** Yeni gönderileri listeye yerinde ekler (iskelet yanıp sönmez) ve en üste kaydırır. */
  const showNew = useCallback(async () => {
    try {
      const page = await fetchFeedPage({ scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool, authors, tags, tools });
      setState((prev) => (prev && prev.key === key ? { ...prev, items: page.items, cursor: page.nextCursor, failed: false, loadingMore: false } : prev));
      setFresh({ key, count: 0, plus: false });
      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    } catch (err) {
      console.error("fetchFeedPage (show new)", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` carries the filter sets by value
  }, [key, scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool]);

  const loadMore = useCallback(async () => {
    if (!current?.cursor || current.loadingMore || current.stale) return;
    const cursor = current.cursor;
    setState((prev) => (prev && prev.key === key ? { ...prev, loadingMore: true, failed: false } : prev));
    try {
      const page = await fetchFeedPage({ scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool, authors, tags, tools, cursor });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` already carries the filter sets by value
  }, [current, key, scope, order, kind, taxonomy, openOnly, hasMedia, tag, tool]);

  return {
    items: current?.items ?? [],
    loading: enabled && current === null,
    failed: current?.failed ?? false,
    /** Saklanan son liste ekranda (gerçeği yükleniyor ya da yüklenemedi). */
    stale: current?.stale ?? false,
    hasMore: Boolean(current?.cursor) && !current?.stale,
    loadingMore: current?.loadingMore ?? false,
    loadMore,
    retry: () => setRetry((n) => n + 1),
    newCount: fresh.key === key && watching ? fresh.count : 0,
    newPlus: fresh.key === key && watching ? fresh.plus : false,
    showNew,
  };
}
