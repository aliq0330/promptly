"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { NotificationList } from "@/features/notifications/notification-list";
import { NotificationCategoryFilter } from "@/features/notifications/notification-category-filter";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { notificationCategory, type NotificationCategory } from "@/lib/notification-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { buttonClassName } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, markRead, markAllRead, clearAll, remove } = useNotifications();
  const [confirmClear, setConfirmClear] = useState(false);
  const clearing = useAsyncAction();
  const [category, setCategory] = useState<"all" | NotificationCategory>("all");

  const filtered = useMemo(
    () =>
      category === "all"
        ? notifications
        : notifications.filter((n) => notificationCategory(n) === category),
    [notifications, category],
  );

  const hasUnread = notifications.some((n) => !n.isRead);

  return (
    <div className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-h1 font-bold text-text">{t("header.notificationsAriaLabel")}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllRead}
            disabled={!hasUnread}
            className={buttonClassName({ size: "sm", variant: "outline" })}
          >
            {t("notifications.markAllRead")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={notifications.length === 0}
            aria-label={t("notifications.clearAll")}
            title={t("notifications.clearAll")}
            className={buttonClassName({ size: "sm", variant: "outline", className: "px-2.5" })}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      </div>
      {confirmClear && (
        <ConfirmDialog
          id="clear-notifications-title"
          title={t("notifications.clearAllTitle")}
          body={t("notifications.clearAllBody")}
          confirmLabel={t("notifications.clearAllConfirm")}
          danger
          busy={clearing.busy}
          error={clearing.error}
          onConfirm={() =>
            void clearing.run(async () => {
              await clearAll();
              setConfirmClear(false);
            })
          }
          onCancel={() => {
            clearing.setError(null);
            setConfirmClear(false);
          }}
        />
      )}
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
