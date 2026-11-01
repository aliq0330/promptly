"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteNotification,
  dispatchMyWeeklyDigest,
  fetchNotificationsForUser,
  fetchNotificationsPage,
  fetchUnreadNotificationCount,
  NOTIFICATIONS_PAGE,
  markAllNotificationsRead,
  deleteAllNotifications,
  markNotificationRead,
} from "@/lib/supabase/notifications";
import { supabase } from "@/lib/supabase/client";
import { dispatchMyEventReminders } from "@/lib/supabase/communities";
import type { AppNotification } from "@/types";

interface NotificationsContextValue {
  notifications: AppNotification[];
  /** Counted by the database (the list below holds only the newest page(s)). */
  unreadCount: number;
  /** Older notifications exist beyond what is loaded. */
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Hepsini veritabanından siler; başarısızsa fırlatır (liste dokunulmaz). */
  clearAll: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/**
 * Real, cross-device notifications — same shape as RealMessagesProvider,
 * backed by the actual Supabase `notifications` table (RLS already limits
 * every read/update/delete to the caller's own rows; see Bölüm 19 and
 * 20260919180000). A single shared fetch here avoids the header bell and
 * the `/notifications` page each triggering their own query.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // How many rows are loaded: a refresh re-reads at least that many, so "Daha fazla" is not undone by every realtime event.
  const loadedRef = useRef(0);
  useEffect(() => {
    loadedRef.current = notifications.length;
  }, [notifications.length]);

  /** Re-reads the loaded range (at least one page) and the unread count. */
  const reload = useCallback(
    async (userId: string, isCancelled: () => boolean = () => false) => {
      const size = Math.max(NOTIFICATIONS_PAGE, loadedRef.current);
      const [result, count] = await Promise.all([fetchNotificationsForUser(userId, size), fetchUnreadNotificationCount(userId)]);
      if (isCancelled()) return;
      setNotifications(result);
      setHasMore(result.length === size);
      if (count !== null) setUnread(count);
      else setUnread(result.filter((n) => !n.isRead).length);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signed out, no real notifications to fetch
      setNotifications([]);
      setUnread(0);
      setHasMore(false);
      return;
    }
    void reload(user.id, () => cancelled);
    // Topluluk etkinlik hatırlatmaları (docs/history/175-*): zamanlayıcı yok; uygulama açılışında, kullanıcının "geliyorum/belki" dediği
    // ve 24 saat içinde başlayan etkinlikler için sunucu bir kez bildirim üretir. Yeni bildirim oluştuysa liste yenilenir.
    // Hata (ör. migration henüz uygulanmadı) bildirimleri etkilemez, sessizce yok sayılır.
    dispatchMyEventReminders()
      .then((created) => (created > 0 && !cancelled ? reload(user.id, () => cancelled) : undefined))
      .catch(() => undefined);
    // Haftalık özet (docs/history/307-*): aynı kalıp — haftada bir kez sunucu tek bildirim üretir, oluştuysa liste yenilenir.
    dispatchMyWeeklyDigest()
      .then((created) => (created > 0 && !cancelled ? reload(user.id, () => cancelled) : undefined))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, reload]);

  const refresh = useCallback(async () => {
    if (!user) return;
    await reload(user.id);
  }, [user, reload]);

  // "Daha fazla" tıklaması ile otomatik yükleme AYNI anda gelebilir: `loadingMore` state'i henüz çizilmeden ikisi de geçer ve aynı sayfa iki kez
  // istenirdi (`usePagedList` aynı yarışı bir ref ile çözer). Ref "bu sayfa yolda"yı anında bildirir.
  const loadingMoreRef = useRef(false);
  const loadMore = useCallback(async () => {
    if (!user || loadingMoreRef.current || !hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const older = await fetchNotificationsPage(user.id, loadedRef.current, NOTIFICATIONS_PAGE);
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...older.filter((n) => !seen.has(n.id))];
      });
      setHasMore(older.length === NOTIFICATIONS_PAGE);
    } catch (err) {
      console.error("notifications loadMore", err);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [user, hasMore]);

  // Gerçek zamanlı senkronizasyon (Bölüm 9.78'in belgelediği, mesajlaşmanın
  // Bölüm 21 Faz C'de kurduğu AYNI desen) — `notifications` tablosu
  // `supabase_realtime` yayınına eklendi (20260919530000). Bu kullanıcının
  // KENDİ satırlarındaki HER olayda (INSERT — yeni bir bildirim; UPDATE —
  // başka bir cihazdan okundu işaretlendi; DELETE — başka bir cihazdan
  // silindi) tüm listeyi yeniden çekiyor — mesajlaşmanın `conversation_
  // members` aboneliğiyle birebir aynı "basit tut" kararı, gerçek bildirim
  // hacmi (birkaç/birkaç onlarca satır) bunu haklı çıkarıyor.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => {
          void reload(user.id);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, reload]);

  const markRead = useCallback(
    async (id: string) => {
      if (!user) return;
      const target = notifications.find((n) => n.id === id);
      if (!target || target.isRead) return;
      // Optimistic — reverted below if the write fails.
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      setUnread((count) => Math.max(0, count - 1));
      try {
        await markNotificationRead(id, user.id);
      } catch (err) {
        console.error("markRead", err);
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
        setUnread((count) => count + 1);
      }
    },
    [user, notifications],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      const previous = notifications;
      const wasUnread = previous.some((n) => n.id === id && !n.isRead);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) setUnread((count) => Math.max(0, count - 1));
      try {
        await deleteNotification(id, user.id);
      } catch (err) {
        console.error("remove notification", err);
        setNotifications(previous);
        if (wasUnread) setUnread((count) => count + 1);
      }
    },
    [user, notifications],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const previous = notifications;
    const previousUnread = unread;
    // Older unread rows may not be loaded: the database's count decides, not the loaded list.
    if (previousUnread === 0 && previous.every((n) => n.isRead)) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead(user.id);
    } catch (err) {
      console.error("markAllRead", err);
      setNotifications(previous);
      setUnread(previousUnread);
    }
  }, [user, notifications, unread]);

  const clearAll = useCallback(async () => {
    if (!user) return;
    await deleteAllNotifications(user.id);
    setNotifications([]);
    setUnread(0);
    setHasMore(false);
  }, [user]);

  const value = useMemo(
    () => ({ notifications, unreadCount: unread, hasMore, loadingMore, loadMore, refresh, markRead, markAllRead, clearAll, remove }),
    [notifications, unread, hasMore, loadingMore, loadMore, refresh, markRead, markAllRead, clearAll, remove],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
