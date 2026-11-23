"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTIVITY_PAGE_SIZE,
  fetchActivityPage,
  fetchActivitySummary,
  recordFollowFeedVisit,
  type ActivityCursor,
  type ActivityEvent,
  type ActivityQuery,
  type ActivitySummary,
} from "@/lib/supabase/following-activity";

/** Yeni etkinlik yoklaması (docs/history/435-* ile aynı: Realtime değil, sekme görünürken 45 sn'de bir). */
const POLL_MS = 45_000;
const VISIT_KEY = "promptly-following-last-visit";

/**
 * "Son ziyaretinden beri" işaretçisi: sekme oturumu boyunca SABİT (aynı oturumda Takip Ettiklerin'e her dönüşte kaymaz). İlk açılışta sunucu
 * bir önceki ziyaretin zamanını verir ve şimdiyi yazar; değer `sessionStorage`'da tutulur. Okunamazsa çizgi çizilmez.
 */
export function useLastVisit(enabled: boolean): { lastVisit: string | null; markSeen: () => void } {
  const [lastVisit, setLastVisit] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(VISIT_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!enabled) return;
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(VISIT_KEY);
    } catch {
      /* depolama kapalı */
    }
    if (stored !== null) return;
    let cancelled = false;
    recordFollowFeedVisit()
      .then((previous) => {
        const value = previous ?? "";
        try {
          window.sessionStorage.setItem(VISIT_KEY, value);
        } catch {
          /* depolama kapalı */
        }
        if (!cancelled) setLastVisit(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  const markSeen = useCallback(() => {
    const now = new Date().toISOString();
    try {
      window.sessionStorage.setItem(VISIT_KEY, now);
    } catch {
      /* depolama kapalı */
    }
    setLastVisit(now);
    void recordFollowFeedVisit().catch(() => undefined);
  }, []);
  return { lastVisit: lastVisit || null, markSeen };
}

export function useFollowingActivity(query: ActivityQuery, enabled: boolean, reloadKey: number) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<ActivityCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const seen = useRef(new Set<string>());
  const generation = useRef(0);
  const queryKey = JSON.stringify(query);

  const loadFirst = useCallback(async () => {
    const run = ++generation.current;
    seen.current = new Set();
    setLoading(true);
    setFailed(false);
    setNewCount(0);
    try {
      const page = await fetchActivityPage(JSON.parse(queryKey) as ActivityQuery, null, seen.current);
      if (run !== generation.current) return;
      setEvents(page.events);
      setCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch {
      if (run !== generation.current) return;
      setEvents([]);
      setFailed(true);
      setHasMore(false);
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [queryKey]);

  useEffect(() => {
    if (!enabled) return;
    void loadFirst();
  }, [enabled, loadFirst, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const run = generation.current;
    setLoadingMore(true);
    setFailed(false);
    try {
      const page = await fetchActivityPage(JSON.parse(queryKey) as ActivityQuery, cursor, seen.current);
      if (run !== generation.current) return;
      setEvents((current) => [...current, ...page.events]);
      setCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch {
      if (run === generation.current) setFailed(true);
    } finally {
      if (run === generation.current) setLoadingMore(false);
    }
  }, [cursor, loadingMore, queryKey]);

  // Yeni etkinlik yoklaması: ilk sayfayı sor, listede olmayan ve en üsttekinden yeni satırları say (liste kaymaz; hap basınca yenilenir).
  const newest = events[0]?.at ?? null;
  useEffect(() => {
    if (!enabled || loading || !newest) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const page = await fetchActivityPage(JSON.parse(queryKey) as ActivityQuery, null, new Set(seen.current), ACTIVITY_PAGE_SIZE);
        if (stopped) return;
        setNewCount(page.events.filter((event) => Date.parse(event.at) > Date.parse(newest)).length);
      } catch {
        /* yoklama sessizce başarısız olur */
      }
    };
    const timer = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, loading, newest, queryKey]);

  const showNew = useCallback(async () => {
    await loadFirst();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [loadFirst]);

  return { events, loading, loadingMore, failed, hasMore, loadMore, retry: loadFirst, newCount, showNew };
}

/** Bir andan beri özet (null = ilk ziyaret: son 7 gün). Hata sessizdir: özet kartı çizilmez. */
export function useActivitySummary(since: string | null, enabled: boolean, reloadKey: number): ActivitySummary | null {
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchActivitySummary(since)
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [since, enabled, reloadKey]);
  return summary;
}
