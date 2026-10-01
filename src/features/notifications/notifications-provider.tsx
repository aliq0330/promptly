"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteNotification,
  fetchNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/supabase/notifications";
import { supabase } from "@/lib/supabase/client";
import type { AppNotification } from "@/types";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
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

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- signed out, no real notifications to fetch
      setNotifications([]);
      return;
    }
    fetchNotificationsForUser(user.id).then((result) => {
      if (!cancelled) setNotifications(result);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const result = await fetchNotificationsForUser(user.id);
    setNotifications(result);
  }, [user]);

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
          fetchNotificationsForUser(user.id).then(setNotifications);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const markRead = useCallback(
    async (id: string) => {
      if (!user) return;
      const target = notifications.find((n) => n.id === id);
      if (!target || target.isRead) return;
      // Optimistic — reverted below if the write fails.
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      try {
        await markNotificationRead(id, user.id);
      } catch (err) {
        console.error("markRead", err);
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: false } : n)));
      }
    },
    [user, notifications],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      const previous = notifications;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      try {
        await deleteNotification(id, user.id);
      } catch (err) {
        console.error("remove notification", err);
        setNotifications(previous);
      }
    },
    [user, notifications],
  );

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const previous = notifications;
    if (previous.every((n) => n.isRead)) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllNotificationsRead(user.id);
    } catch (err) {
      console.error("markAllRead", err);
      setNotifications(previous);
    }
  }, [user, notifications]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, refresh, markRead, markAllRead, remove }),
    [notifications, unreadCount, refresh, markRead, markAllRead, remove],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
