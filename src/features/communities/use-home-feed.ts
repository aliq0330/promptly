"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCommunityCards, type CommunityCard } from "@/lib/supabase/chat-groups";
import { fetchDiscoverFeed, fetchMemberFeed, type CommunityPost, type HomeFeedCursor } from "@/lib/supabase/communities";
import { appendUnique, type DiscoverFeedSource } from "@/lib/community-home";

export interface HomeFeedEntry {
  id: string;
  post: CommunityPost;
  source: DiscoverFeedSource;
}

type Status = "loading" | "ready" | "error";

/** Sunucu sayfası tamamen gösterilemez gönderilerden oluşursa (silinmiş içerik) kullanıcıya boş sayfa yerine sonraki sayfa çekilir; üst sınır. */
const MAX_EMPTY_PAGES = 3;

/**
 * Topluluklar ana sayfasının iki akışı (`member` = Gönderiler, `discover` = Keşfet) için ortak durum: ilk yükleme, "daha fazla", hata ve yenileme.
 * Kopyalar `appendUnique` ile elenir. Keşfet'te `asOf` hook ömrü boyunca sabittir (sunucu görülenleri/yeniliği bu ana göre keser); `reload` yeni an alır.
 */
export function useHomeFeed(kind: "member" | "discover") {
  const [status, setStatus] = useState<Status>("loading");
  const [entries, setEntries] = useState<HomeFeedEntry[]>([]);
  const [cards, setCards] = useState<Map<string, CommunityCard>>(new Map());
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [nonce, setNonce] = useState(0);
  const cursor = useRef<HomeFeedCursor | null>(null);
  const offset = useRef(0);
  const asOf = useRef(new Date().toISOString());
  const cardsRef = useRef(cards);
  const generation = useRef(0);

  const loadCards = useCallback(async (ids: string[]) => {
    const missing = [...new Set(ids)].filter((id) => !cardsRef.current.has(id));
    if (missing.length === 0) return;
    try {
      const fetched = await fetchCommunityCards(missing);
      const next = new Map(cardsRef.current);
      for (const card of fetched) next.set(card.id, card);
      cardsRef.current = next;
      setCards(next);
    } catch (err) {
      console.error("community cards", err);
    }
  }, []);

  /** Bir sayfa çeker; gösterilebilir gönderi yoksa ve sunucuda daha varsa en çok `MAX_EMPTY_PAGES` kez devam eder. */
  const fetchPage = useCallback(async (mine: number): Promise<{ entries: HomeFeedEntry[]; hasMore: boolean }> => {
    let collected: HomeFeedEntry[] = [];
    let more = true;
    for (let i = 0; i < MAX_EMPTY_PAGES && more && collected.length === 0; i += 1) {
      if (kind === "member") {
        const page = await fetchMemberFeed(cursor.current);
        if (mine !== generation.current) return { entries: [], hasMore: false }; // bayat istek imleci bozmaz
        cursor.current = page.next;
        more = page.hasMore;
        collected = page.posts.map((post) => ({ id: post.id, post, source: "member" as const }));
      } else {
        const page = await fetchDiscoverFeed(asOf.current, offset.current);
        if (mine !== generation.current) return { entries: [], hasMore: false };
        offset.current = page.nextOffset;
        more = page.hasMore;
        collected = page.entries.map((entry) => ({ id: entry.post.id, post: entry.post, source: entry.source }));
      }
    }
    return { entries: collected, hasMore: more };
  }, [kind]);

  useEffect(() => {
    const mine = (generation.current += 1);
    cursor.current = null;
    offset.current = 0;
    if (nonce > 0) asOf.current = new Date().toISOString();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yenilemede yükleniyor durumuna dönülür
    setStatus("loading");
    fetchPage(mine)
      .then(async (page) => {
        if (mine !== generation.current) return;
        await loadCards(page.entries.map((e) => e.post.communityId));
        if (mine !== generation.current) return;
        setEntries(appendUnique([], page.entries));
        setHasMore(page.hasMore);
        setMoreError(false);
        setStatus("ready");
      })
      .catch((err) => {
        console.error(`home feed (${kind})`, err);
        if (mine === generation.current) setStatus("error");
      });
  }, [fetchPage, loadCards, kind, nonce]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchPage(mine);
      if (mine !== generation.current) return;
      await loadCards(page.entries.map((e) => e.post.communityId));
      if (mine !== generation.current) return;
      setEntries((prev) => appendUnique(prev, page.entries));
      setHasMore(page.hasMore);
    } catch (err) {
      console.error(`home feed more (${kind})`, err);
      if (mine === generation.current) setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, kind, loadCards, loadingMore]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { status, entries, cards, hasMore, loadingMore, moreError, loadMore, reload };
}
