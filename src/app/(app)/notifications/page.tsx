"use client";

import { NotificationList } from "@/features/notifications/notification-list";
import { useNotifications } from "@/features/notifications/notifications-provider";

export default function NotificationsPage() {
  const { notifications, markRead, remove } = useNotifications();

  return (
    <div className="px-4 py-6 lg:px-6">
      <h1 className="mb-4 text-base font-semibold text-text">Bildirimler</h1>
      <NotificationList notifications={notifications} onRead={markRead} onDelete={remove} />
    </div>
  );
}
