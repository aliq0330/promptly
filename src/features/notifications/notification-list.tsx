"use client";

import { NotificationRow } from "./notification-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { AppNotification } from "@/types";

interface NotificationListProps {
  notifications: AppNotification[];
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  emptyMessage?: string;
}

export function NotificationList({
  notifications,
  onRead,
  onDelete,
  emptyMessage,
}: NotificationListProps) {
  const { t } = useTranslation();
  if (notifications.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">{emptyMessage ?? t("notifications.noneYet")}</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {notifications.map((notification) => (
        <NotificationRow
          key={notification.id}
          notification={notification}
          onRead={onRead}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
