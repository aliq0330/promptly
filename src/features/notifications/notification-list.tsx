"use client";

import { NotificationRow } from "./notification-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import { groupNotificationsByDay, type NotificationDayGroup } from "@/lib/notification-groups";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { AppNotification } from "@/types";

const GROUP_LABEL_KEYS: Record<NotificationDayGroup, TranslationKey> = {
  today: "notifications.groupToday",
  yesterday: "notifications.groupYesterday",
  thisWeek: "notifications.groupThisWeek",
  older: "notifications.groupOlder",
};

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

  // Meydan (docs/history/190-*): day groups (Bugün · Dün · Bu hafta · Daha eski) over the same newest-first list.
  return (
    <div className="space-y-5">
      {groupNotificationsByDay(notifications).map(({ group, items }) => (
        <section key={group} aria-labelledby={`notif-group-${group}`} className="space-y-2">
          <h2 id={`notif-group-${group}`} className="px-1 font-display text-[1.0625rem] font-bold tracking-[-0.02em] text-text">
            {t(GROUP_LABEL_KEYS[group])}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border-soft bg-surface shadow-card">
            {items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={onRead}
                onDelete={onDelete}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
