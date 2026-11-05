"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EXIT_MS } from "@/components/ui/exit-motion";
import { prefersReducedMotion } from "@/lib/motion";
import { useAuth } from "@/features/auth/auth-provider";
import { useNotifications, type CardEvent } from "./notifications-provider";
import { fetchNotificationCardsPage, NOTIFICATION_CARDS_PAGE, type NotificationCardsQuery } from "@/lib/supabase/notifications";
import { EMPTY_NOTIFICATION_CONTEXT, fetchNotificationContext, type NotificationContext } from "@/lib/supabase/notification-context";
import type { NotificationCard } from "@/types";

export type CardsStatus = "loading" | "ready" | "error";

/** Karta yerel (sunucudan gelmeyen) durum: yazılan yanıt balonu, mesaj isteği sonucu. Liste yeniden okununca sıfırlanır. */
export interface LocalCardState {
  reply?: { id: string; body: string } | null;
  request?: "accepted" | "declined" | null;
}

function insertSorted(cards: NotificationCard[], card: NotificationCard): NotificationCard[] {
  if (cards.some((existing) => existing.key === card.key)) return cards;
  const next = [...cards, card];
  next.sort((a, b) => (a.sortAt === b.sortAt ? (a.key < b.key ? 1 : -1) : a.sortAt < b.sortAt ? 1 : -1));
  return next;
}

/**
 * Bildirim kartlarının bir listesi (zil paneli ve /notifications aynı kancayı kullanır, docs/history/326-*): sunucudan keyset sayfalı, süzgeç
 * (`category`/`unreadOnly`/`snoozedOnly`) SUNUCUDA; sağlayıcının iyimser olaylarını (okundu, kaldır, geri getir) kendi durumuna uygular.
 * Gerçek zamanlı yeni bildirim listeyi YENİDEN DİZMEZ: `newCount` artar, kullanıcı "N yeni"ye basınca `reload` çalışır (yerinde kayma yok).
 * Kartların ek verisi (yorum gövdesi, takip-geri, öneri farkı, bağlı içerik) sayfa başına tür başına tek toplu sorguyla `context`'e gelir.
 */
export function useNotificationCards(query: NotificationCardsQuery, enabled = true) {
  const { user } = useAuth();
  const { subscribe, incoming } = useNotifications();
  const [cards, setCards] = useState<NotificationCard[]>([]);
  // Çıkış animasyonundaki (silinen) kartlar: listede kalır, `ExitMotion` ile kapanır.
  const [leavingKeys, setLeavingKeys] = useState<ReadonlySet<string>>(() => new Set());
  const leaveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [status, setStatus] = useState<CardsStatus>("loading");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  const [context, setContext] = useState<NotificationContext>(EMPTY_NOTIFICATION_CONTEXT);
  const [local, setLocalState] = useState<Record<string, LocalCardState>>({});
  const [baseIncoming, setBaseIncoming] = useState(incoming);
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const contextFetched = useRef(new Set<string>());
  const cardsRef = useRef<NotificationCard[]>([]);
  useEffect(() => {
    cardsRef.current = cards;
  }, [cards]);

  const queryKey = `${query.category ?? ""}|${query.unreadOnly ? 1 : 0}|${query.snoozedOnly ? 1 : 0}`;
  const incomingRef = useRef(incoming);
  useEffect(() => {
    incomingRef.current = incoming;
  }, [incoming]);

  const load = useCallback(
    async (silent: boolean) => {
      if (!user || !enabled) return;
      const id = ++requestId.current;
      if (!silent) setStatus("loading");
      try {
        const page = await fetchNotificationCardsPage(null, NOTIFICATION_CARDS_PAGE, query);
        if (id !== requestId.current) return;
        setBaseIncoming(incomingRef.current);
        contextFetched.current = new Set();
        setContext(EMPTY_NOTIFICATION_CONTEXT);
        setLocalState({});
        setCards(page);
        setHasMore(page.length === NOTIFICATION_CARDS_PAGE);
        setMoreFailed(false);
        setStatus("ready");
      } catch (err) {
        if (id !== requestId.current) return;
        console.error("notification cards", err);
        setStatus("error");
      }
    },
    // `query` değişimi `queryKey` ile izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, enabled, queryKey],
  );

  useEffect(() => {
    if (!user || !enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- süzgeç/kullanıcı değişince liste baştan okunur
    void load(false);
  }, [user, enabled, load]);

  // Boş liste ya da ilk yükleme sürerken gelen bildirim bekletilmez: doğrudan yenilenir.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- yeni bildirim gelince boş liste kendiliğinden yenilenir
    if (status === "ready" && cards.length === 0 && incoming > baseIncoming) void load(true);
  }, [incoming, baseIncoming, status, cards.length, load]);

  const loadMore = useCallback(async () => {
    if (!user || loadingMoreRef.current || !hasMore) return;
    const last = cardsRef.current[cardsRef.current.length - 1];
    if (!last) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreFailed(false);
    const id = requestId.current;
    try {
      const older = await fetchNotificationCardsPage({ at: last.sortAt, key: last.key }, NOTIFICATION_CARDS_PAGE, query);
      if (id !== requestId.current) return;
      setCards((prev) => {
        const seen = new Set(prev.map((card) => card.key));
        return [...prev, ...older.filter((card) => !seen.has(card.key))];
      });
      setHasMore(older.length === NOTIFICATION_CARDS_PAGE);
    } catch (err) {
      console.error("notification cards loadMore", err);
      setMoreFailed(true);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, hasMore, queryKey]);

  useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  // Sağlayıcının iyimser olayları.
  useEffect(() => {
    return subscribe((event: CardEvent) => {
      switch (event.type) {
        case "read":
          setCards((prev) => prev.map((card) => (card.key === event.key ? { ...card, unreadCount: event.read ? 0 : Math.max(1, card.unreadCount) } : card)));
          break;
        case "remove": {
          // Kart hemen çıkmaz: önce kayıp solar, satır kapanır (docs/history/335-*), sonra listeden düşer. Hareketi azalt açıkken anında.
          const key = event.key;
          if (prefersReducedMotion()) {
            setCards((prev) => prev.filter((card) => card.key !== key));
            break;
          }
          if (leaveTimers.current.has(key)) break;
          setLeavingKeys((prev) => new Set(prev).add(key));
          leaveTimers.current.set(
            key,
            setTimeout(() => {
              leaveTimers.current.delete(key);
              setLeavingKeys((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
              });
              setCards((prev) => prev.filter((card) => card.key !== key));
            }, EXIT_MS),
          );
          break;
        }
        case "restore": {
          // "Geri al" çıkış sürerken gelirse kart zaten listede: yalnız çıkışı iptal et.
          const pending = leaveTimers.current.get(event.card.key);
          if (pending) {
            clearTimeout(pending);
            leaveTimers.current.delete(event.card.key);
            setLeavingKeys((prev) => {
              const next = new Set(prev);
              next.delete(event.card.key);
              return next;
            });
            break;
          }
          setCards((prev) => insertSorted(prev, event.card));
          break;
        }
        case "readAll":
          setCards((prev) => prev.map((card) => (card.unreadCount ? { ...card, unreadCount: 0 } : card)));
          break;
        case "clear":
          setCards([]);
          setHasMore(false);
          break;
      }
    });
  }, [subscribe]);

  // Yeni gelen kartların ek verisi.
  useEffect(() => {
    if (!user || cards.length === 0) return;
    const fresh = cards.filter((card) => !contextFetched.current.has(card.key));
    if (fresh.length === 0) return;
    fresh.forEach((card) => contextFetched.current.add(card.key));
    const id = requestId.current;
    void fetchNotificationContext(fresh, user.id).then((extra) => {
      if (id !== requestId.current) return;
      setContext((prev) => ({
        comments: new Map([...prev.comments, ...extra.comments]),
        following: new Set([...prev.following, ...extra.following]),
        suggestions: new Map([...prev.suggestions, ...extra.suggestions]),
        linked: new Map([...prev.linked, ...extra.linked]),
        attachmentSettled: new Set([...prev.attachmentSettled, ...extra.attachmentSettled]),
        attachmentFailed: new Set([...prev.attachmentFailed, ...extra.attachmentFailed]),
      }));
    });
  }, [cards, user]);

  const setFollowing = useCallback((userId: string, following: boolean) => {
    setContext((prev) => {
      const next = new Set(prev.following);
      if (following) next.add(userId);
      else next.delete(userId);
      return { ...prev, following: next };
    });
  }, []);

  const patchSuggestion = useCallback((suggestionId: string, status: "pending" | "accepted" | "rejected") => {
    setContext((prev) => {
      const current = prev.suggestions.get(suggestionId);
      if (!current) return prev;
      return { ...prev, suggestions: new Map(prev.suggestions).set(suggestionId, { ...current, status }) };
    });
  }, []);

  const setLocal = useCallback((key: string, patch: LocalCardState) => {
    setLocalState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }, []);

  const newCount = Math.max(0, incoming - baseIncoming);
  const reload = useCallback(() => load(true), [load]);

  return useMemo(
    () => ({ cards, leavingKeys, status, hasMore, loadingMore, moreFailed, loadMore, reload, newCount, context, local, setLocal, setFollowing, patchSuggestion }),
    [cards, leavingKeys, status, hasMore, loadingMore, moreFailed, loadMore, reload, newCount, context, local, setLocal, setFollowing, patchSuggestion],
  );
}
