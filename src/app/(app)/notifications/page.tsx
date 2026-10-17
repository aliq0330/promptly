"use client";

import { useMemo, useState } from "react";
import { NotificationList } from "@/features/notifications/notification-list";
import { NotificationCategoryFilter } from "@/features/notifications/notification-category-filter";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { NOTIFICATION_CATEGORY, type NotificationCategory } from "@/lib/notification-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { buttonClassName } from "@/components/ui/button";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, markRead, markAllRead, remove } = useNotifications();
  const [category, setCategory] = useState<"all" | NotificationCategory>("all");

  const filtered = useMemo(
    () =>
      category === "all"
        ? notifications
        : notifications.filter((n) => NOTIFICATION_CATEGORY[n.type] === category),
    [notifications, category],
  );

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-h1 font-bold text-text">{t("header.notificationsAriaLabel")}</h1>
        <button
          type="button"
          onClick={markAllRead}
          disabled={!hasUnread}
          className={buttonClassName({ size: "sm", variant: "outline" })}
        >
          {t("notifications.markAllRead")}
        </button>
      </div>
      <NotificationCategoryFilter active={category} onChange={setCategory} />
      <NotificationList
        notifications={filtered}
        onRead={markRead}
        onDelete={remove}
        emptyMessage={
          category === "all" ? t("notifications.noneYet") : t("notifications.noneInCategory")
        }
      />
    </div>
  );
}
