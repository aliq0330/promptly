"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "@/components/icons/arrow-right";
import { CheckCheck } from "@/components/icons/check-check";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Portal } from "@/components/ui/portal";
import { SectionMenu } from "@/features/content/section-menu";
import { LoadMore } from "@/features/feed/load-more";
import { NotificationCardView } from "./notification-card-view";
import { UndoBar } from "./undo-bar";
import { useNotifications } from "./notifications-provider";
import { useNotificationCards } from "./use-notification-cards";
import { useListShortcuts } from "./use-list-shortcuts";
import { useNotificationViewMenu, viewToQuery, type NotificationView } from "./notification-view";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

const PANEL_WIDTH = 440;
const GAP = 10;

/**
 * Zilin altında açılan bildirim paneli (docs/history/326-*, masaüstü ≥ md): portal + `position: fixed` (kırpan ataya `absolute` konmaz, CLAUDE.md §4),
 * zile bağlı ok, arkası loşlanmaz. Kapanış: Esc, dışarı tıklama, rota değişimi, panel içindeki bağlantı. Kartlar hızlı eylemlerle gelir (beğen, yanıtla, takip
 * et, kabul/reddet), "Ayrıntı"/"Tüm bildirimleri gör" `/notifications` sayfasına götürür. Gerçek zamanlı yeni bildirim listeyi kaydırmaz: "N yeni" hapı çıkar.
 */
export function NotificationPopover({ anchor, onClose }: { anchor: HTMLElement | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { unreadCount, markAllRead } = useNotifications();
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<NotificationView>("all");
  const menu = useNotificationViewMenu();
  const list = useNotificationCards(viewToQuery(view));
  const [pos, setPos] = useState<{ top: number; right: number; nub: number } | null>(null);
  const firstPath = useRef(pathname);
  useListShortcuts(listRef, true);

  // Konum: zilin altı, sağ kenarı zile hizalı; pencere yeniden boyutlanınca/kaydırılınca yeniden hesaplanır.
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const right = Math.max(8, window.innerWidth - rect.right - 8);
      const panelRight = window.innerWidth - right;
      const nub = Math.min(Math.max(panelRight - (rect.left + rect.width / 2) - 8, 20), PANEL_WIDTH - 36);
      setPos({ top: rect.bottom + GAP, right, nub });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      // Karttan açılan emoji seçicisi ve "Tepkiler" penceresi gövdeye portallanır: panelin DIŞINDA görünür ama panelin parçasıdır (docs/history/327-*).
      if ((target as Element).closest?.("[data-reaction-picker], [aria-modal='true']")) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Açık bir emoji seçici/pencere varsa Esc önce onu kapatır, panel yerinde kalır.
        if (document.querySelector("[data-reaction-picker], [aria-modal='true']")) return;
        onClose();
        anchor?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  // Rota değişince kapan (ilk render hariç).
  useEffect(() => {
    if (pathname !== firstPath.current) onClose();
  }, [pathname, onClose]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>("[data-notification-card]")?.focus({ preventScroll: true });
  }, [list.status]);

  if (!pos) return null;
  return (
    <Portal>
      <section
        ref={panelRef}
        role="dialog"
        aria-label={t("header.notificationsAriaLabel")}
        data-notification-popover=""
        style={{ top: pos.top, right: pos.right, width: PANEL_WIDTH, maxHeight: `calc(100dvh - ${pos.top + 16}px)` }}
        className="fixed z-50 flex max-w-[calc(100vw-1rem)] animate-pop-in flex-col rounded-[1.375rem] border border-border-soft bg-surface shadow-pop"
      >
        <span aria-hidden style={{ right: pos.nub }} className="absolute -top-[9px] size-4 rotate-45 rounded-tl border-l border-t border-border-soft bg-surface" />

        <div className="flex shrink-0 items-center gap-1 py-3.5 pl-5 pr-2">
          <h2 className="flex-1 font-display text-[1.3125rem] font-bold tracking-[-0.01em] text-text">{t("header.notificationsAriaLabel")}</h2>
          <button type="button" onClick={() => void markAllRead()} disabled={unreadCount === 0} data-action="mark-all-read" className="h-11 rounded-full px-3 text-small font-semibold text-primary hover:bg-primary-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="max-[520px]:hidden">{t("notifications.markAllRead")}</span>
            <CheckCheck size={20} aria-hidden className="hidden max-[520px]:block" />
          </button>
          <Link href="/settings/notifications" onClick={onClose} aria-label={t("nc.settings")} title={t("nc.settings")} data-action="settings" className="grid size-11 place-items-center rounded-full text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 px-5 pb-2.5">
          <SectionMenu items={menu} active={view} onChange={setView} ariaLabel={t("notifications.categoriesAria")} title={t("header.notificationsAriaLabel")} />
          <span className="text-small font-semibold text-text-muted" data-unread-text="">{unreadCount > 0 ? t("nc.unreadCount", { count: unreadCount }) : t("nc.allRead")}</span>
          <span className="flex-1" />
          {list.newCount > 0 && (
            <button
              type="button"
              onClick={() => {
                void list.reload();
                listRef.current?.scrollTo({ top: 0 });
              }}
              data-action="show-new"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-small font-semibold text-primary-foreground hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              <span aria-hidden className="size-2 rounded-full bg-primary-foreground" />
              {t("nc.newCount", { count: list.newCount })}
            </button>
          )}
        </div>

        <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2.5 pb-2" data-notification-list="">
          {list.status === "loading" && (
            <div aria-busy className="space-y-2" data-notification-loading="">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton-shimmer h-24 rounded-2xl" />
              ))}
            </div>
          )}
          {list.status === "error" && (
            <div className="px-3 py-8 text-center">
              <p className="text-small text-text-muted">{t("nc.loadFailed")}</p>
              <button type="button" onClick={() => void list.reload()} className="mt-2 h-11 rounded-full px-4 text-small font-semibold text-primary hover:bg-primary-soft">{t("nc.retry")}</button>
            </div>
          )}
          {list.status === "ready" && list.cards.length === 0 && <p className="px-3 py-10 text-center text-small text-text-muted" data-notification-empty="">{view === "all" ? t("notifications.noneYet") : t("notifications.noneInCategory")}</p>}
          {list.status === "ready" &&
            list.cards.map((card) => <NotificationCardView key={card.key} card={card} list={list} variant="popover" onNavigate={onClose} />)}
          {list.status === "ready" && <LoadMore failed={list.moreFailed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={() => void list.loadMore()} auto />}
        </div>

        <UndoBar placement="inline" />

        <div className={cn("shrink-0 border-t border-border-soft p-3.5")}>
          <Link href="/notifications" onClick={onClose} data-action="see-all" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary-soft text-body font-semibold text-primary hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {t("nc.seeAll")}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </section>
    </Portal>
  );
}
