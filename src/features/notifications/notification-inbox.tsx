"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { ListControlRow, SadeTitle } from "@/features/content/list-control-row";
import { CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { LoadMore } from "@/features/feed/load-more";
import { NotificationCardView } from "./notification-card-view";
import { NotificationDetail } from "./notification-detail";
import { NotificationListRow } from "./notification-list-row";
import { UndoBar } from "./undo-bar";
import { useNotifications } from "./notifications-provider";
import { useNotificationCards } from "./use-notification-cards";
import { useListShortcuts } from "./use-list-shortcuts";
import { useMinWidth } from "./use-min-width";
import { useNotificationViewMenu, viewToQuery, type NotificationView } from "./notification-view";
import { groupNotificationsByDay, type NotificationDayGroup } from "@/lib/notification-groups";
import type { TranslationKey } from "@/lib/i18n/translations";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

const GROUP_LABEL_KEYS: Record<NotificationDayGroup, TranslationKey> = {
  today: "notifications.groupToday",
  yesterday: "notifications.groupYesterday",
  thisWeek: "notifications.groupThisWeek",
  older: "notifications.groupOlder",
};

const VIEW_PARAMS: NotificationView[] = ["all", "unread", "posts", "requests", "follow", "messages", "community", "system", "snoozed"];

/**
 * `/notifications` (docs/history/326-*): bildirim DETAY sayfası. Masaüstünde (≥ lg) bölünmüş gelen kutusu — solda kart listesi, sağda seçili bildirimin
 * ayrıntısı (`?n=<kart anahtarı>`); telefon/tablette genişleyen kartlar, "Ayrıntı" ile tam sayfa. Eski tek sütunlu düz liste kalktı (hedef sayfaya gitmek
 * ayrıntıdaki "Aç" bağlantılarıyla yapılır).
 */
function Inbox() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const wide = useMinWidth(1024);
  const { unreadCount, markAllRead, clearAll } = useNotifications();
  // `?view=snoozed` (Ayarlar → Ertelenenler) gibi bağlantılar o görünümle açılır.
  const [view, setView] = useState<NotificationView>(() => {
    const wantedView = params.get("view");
    return VIEW_PARAMS.find((candidate) => candidate === wantedView) ?? "all";
  });
  const menu = useNotificationViewMenu();
  const list = useNotificationCards(viewToQuery(view));
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const clearing = useAsyncAction();
  const listRef = useRef<HTMLDivElement>(null);
  useListShortcuts(listRef, wide);

  const wanted = params.get("n");
  const selectedFromUrl = wanted ? (list.cards.find((card) => card.key === wanted) ?? null) : null;
  const selected = wide ? (selectedFromUrl ?? list.cards[0] ?? null) : selectedFromUrl;
  const select = (key: string | null) => router.replace(key ? `/notifications?n=${encodeURIComponent(key)}` : "/notifications", { scroll: false });
  const grouped = useMemo(() => groupNotificationsByDay(list.cards.map((card) => ({ ...card, createdAt: card.sortAt }))), [list.cards]);
  const cardByKey = useMemo(() => new Map(list.cards.map((card) => [card.key, card])), [list.cards]);

  // Telefon/tablet: seçili kart varsa tam sayfa ayrıntı.
  if (!wide && selected) {
    return (
      <div className="fixed inset-0 z-[55] flex flex-col bg-background" data-notification-page="detail">
        <NotificationDetail card={selected} list={list} variant="page" onBack={() => select(null)} />
        <UndoBar placement="fixed" />
      </div>
    );
  }

  const controls = (
    <ListControlRow
      showView={false}
      menu={{ items: menu, active: view, onChange: setView, ariaLabel: t("notifications.categoriesAria"), title: t("header.notificationsAriaLabel") }}
      trailing={
        <>
          {list.newCount > 0 && (
            <button type="button" onClick={() => void list.reload()} data-action="show-new" className="mr-1 inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-small font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
              <span aria-hidden className="size-2 rounded-full bg-primary-foreground" />
              {t("nc.newCount", { count: list.newCount })}
            </button>
          )}
          <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} aria-label={t("notifications.markAllRead")} title={t("notifications.markAllRead")} data-action="mark-all-read" className={cn(CONTROL_ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}>
            <CheckCheck size={22} strokeWidth={1.75} aria-hidden />
          </button>
          <Link href="/settings/notifications" aria-label={t("nc.settings")} title={t("nc.settings")} data-action="settings" className={CONTROL_ICON_BUTTON}>
            <SlidersHorizontal size={22} strokeWidth={1.75} aria-hidden />
          </Link>
          <button type="button" onClick={() => setConfirmClear(true)} disabled={list.cards.length === 0} aria-label={t("notifications.clearAll")} title={t("notifications.clearAll")} data-action="clear-all" className={cn(CONTROL_ICON_BUTTON, "disabled:cursor-not-allowed disabled:opacity-40")}>
            <Trash2 size={22} strokeWidth={1.75} aria-hidden />
          </button>
        </>
      }
    />
  );

  const states = (
    <>
      {list.status === "loading" && (
        <div aria-busy className="space-y-2" data-notification-loading="">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton-shimmer h-24 rounded-2xl" />
          ))}
        </div>
      )}
      {list.status === "error" && (
        <div className="py-10 text-center">
          <p className="text-small text-text-muted">{t("nc.loadFailed")}</p>
          <button type="button" onClick={() => void list.reload()} className="mt-2 h-11 rounded-full px-4 text-small font-semibold text-primary hover:bg-primary-soft">{t("nc.retry")}</button>
        </div>
      )}
      {list.status === "ready" && list.cards.length === 0 && <p className="py-12 text-center text-small text-text-muted" data-notification-empty="">{view === "all" ? t("notifications.noneYet") : t("notifications.noneInCategory")}</p>}
    </>
  );

  return (
    <div className={cn("mx-auto w-full space-y-5 px-3 pb-24 pt-3 sm:px-5 sm:pt-5 lg:px-8", wide ? "max-w-6xl" : "max-w-3xl")} data-notification-page={wide ? "split" : "list"}>
      <div>
        <SadeTitle>{t("header.notificationsAriaLabel")}</SadeTitle>
        <p className="mt-1 text-small font-medium text-text-muted" data-unread-text="">{unreadCount > 0 ? t("nc.unreadCountLong", { count: unreadCount }) : t("nc.allRead")}</p>
      </div>
      {controls}
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
              void list.reload();
            })
          }
          onCancel={() => {
            clearing.setError(null);
            setConfirmClear(false);
          }}
        />
      )}

      {wide ? (
        <div className="flex items-start gap-5">
          <div ref={listRef} className="w-[23.75rem] shrink-0 space-y-3 rounded-[1.375rem] border border-border-soft bg-surface p-2" data-notification-list="">
            {states}
            {list.status === "ready" &&
              grouped.map(({ group, items }) => (
                <section key={group} aria-label={t(GROUP_LABEL_KEYS[group])} className="space-y-1">
                  {items.map((item) => {
                    const card = cardByKey.get(item.key);
                    return card ? <NotificationListRow key={card.key} card={card} list={list} selected={selected?.key === card.key} onSelect={() => select(card.key)} /> : null;
                  })}
                </section>
              ))}
            {list.status === "ready" && <LoadMore failed={list.moreFailed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={() => void list.loadMore()} auto />}
          </div>
          <div className="min-w-0 flex-1 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto">
            {selected ? <NotificationDetail key={selected.key} card={selected} list={list} variant="panel" /> : list.status === "ready" ? <p className="rounded-[1.375rem] border border-border-soft bg-surface p-10 text-center text-small text-text-muted">{t("nc.selectOne")}</p> : null}
          </div>
        </div>
      ) : (
        <div ref={listRef} className="space-y-2.5" data-notification-list="">
          {states}
          {list.status === "ready" &&
            list.cards.map((card, index) => {
              const open = openKey === null ? index === 0 : openKey === card.key;
              return (
                <NotificationCardView
                  key={card.key}
                  card={card}
                  list={list}
                  variant="page"
                  open={open}
                  onToggle={() => setOpenKey(open ? "" : card.key)}
                />
              );
            })}
          {list.status === "ready" && <LoadMore failed={list.moreFailed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={() => void list.loadMore()} auto />}
        </div>
      )}
      <UndoBar placement="fixed" />
    </div>
  );
}

export function NotificationsInbox() {
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  );
}
