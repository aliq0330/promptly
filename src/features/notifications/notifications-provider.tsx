"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  deleteNotification,
  fetchNotificationsForUser,
  markNotificationRead,
} from "@/lib/supabase/notifications";
import type { AppNotification } from "@/types";

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
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

  const unreadCount = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  const value = useMemo(
    () => ({ notifications, unreadCount, refresh, markRead, remove }),
    [notifications, unreadCount, refresh, markRead, remove],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
