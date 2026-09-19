"use client";

import { useEffect, useState } from "react";
import { NotificationList } from "@/features/notifications/notification-list";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchNotificationsForUser } from "@/lib/supabase/notifications";
import type { AppNotification } from "@/types";

/**
 * Real notifications page. This always resolves to an empty list today —
 * nothing in the app writes to the real `notifications` table yet (Bölüm
 * 19 deliberately left no client insert policy, and no server-side trigger
 * produces one either) — the empty state below is the honest, correct
 * result, not a bug.
 */
export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch while signed out
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

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Bildirimler</h1>
      <NotificationList notifications={notifications} />
    </div>
  );
}
