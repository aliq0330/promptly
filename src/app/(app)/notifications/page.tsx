"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Info, LayoutGrid, MessageCircle, Sparkles, SquareTerminal, Trash2, UserPlus, Users, type LucideIcon } from "lucide-react";
import { NotificationList } from "@/features/notifications/notification-list";
import { ListControlRow, SadeTitle } from "@/features/content/list-control-row";
import { CONTROL_ICON_BUTTON, type SectionMenuItem } from "@/features/content/section-menu";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { CATEGORY_FILTERS, notificationCategory, type NotificationCategory } from "@/lib/notification-utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { LoadMore } from "@/features/feed/load-more";

const CATEGORY_ICONS: Record<"all" | NotificationCategory, LucideIcon> = {
  all: LayoutGrid,
  posts: SquareTerminal,
  requests: Sparkles,
  follow: UserPlus,
  messages: MessageCircle,
  community: Users,
  system: Info,
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, unreadCount, hasMore, loadingMore, loadMore, markRead, markAllRead, clearAll, remove } = useNotifications();
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

  // The database's count: older unread rows may not be loaded yet.
  const hasUnread = unreadCount > 0;

  const unreadIn = (key: "all" | NotificationCategory) =>
    notifications.filter((n) => !n.isRead && (key === "all" || notificationCategory(n) === key)).length;
  const menuItems: SectionMenuItem<"all" | NotificationCategory>[] = CATEGORY_FILTERS.map((filter) => ({
    key: filter.key,
    label: t(filter.labelKey),
    icon: CATEGORY_ICONS[filter.key],
    count: unreadIn(filter.key) || undefined,
    // "Tümü" is the first group; the topical categories follow after a divider.
    dividerBefore: filter.key === "posts",
  }));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-3 pb-16 pt-3 sm:px-5 sm:pt-5 lg:px-8">
      <SadeTitle>{t("header.notificationsAriaLabel")}</SadeTitle>
      {/* Sade düzen (docs/history/234-*): tek "Tümü ▾" kategori menüsü (okunmamış sayılarıyla) + tümünü okundu say + hepsini sil. */}
      <ListControlRow
        showView={false}
        menu={{ items: menuItems, active: category, onChange: setCategory, ariaLabel: t("notifications.categoriesAria"), title: t("header.notificationsAriaLabel") }}
        trailing={
          <>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!hasUnread}
              aria-label={t("notifications.markAllRead")}
              title={t("notifications.markAllRead")}
              className={cn(CONTROL_ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}
            >
              <CheckCheck size={22} strokeWidth={1.75} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              disabled={notifications.length === 0}
              aria-label={t("notifications.clearAll")}
              title={t("notifications.clearAll")}
              className={cn(CONTROL_ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}
            >
              <Trash2 size={22} strokeWidth={1.75} aria-hidden />
            </button>
          </>
        }
      />
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
      <NotificationList
        notifications={filtered}
        onRead={markRead}
        onDelete={remove}
        emptyMessage={
          category === "all" ? t("notifications.noneYet") : t("notifications.noneInCategory")
        }
      />
      <LoadMore failed={false} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={() => void loadMore()} auto />
    </div>
  );
}
