"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { BellIcon } from "@/components/ui/motion-icons";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { NotificationPopover } from "./notification-popover";
import { useNotifications } from "./notifications-provider";
import { useMinWidth } from "./use-min-width";
import { useTranslation } from "@/lib/i18n/language-provider";

/**
 * Üst çubuktaki zil (docs/history/326-*): okunmamış KART sayısı rozeti (99+). Masaüstünde (≥ md) zilin altında hızlı eylemli bir panel açar; telefonda doğrudan
 * `/notifications` sayfasına gider (panel yok).
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { unreadCount, incoming } = useNotifications();
  // Realtime ile yeni bir bildirim gelince zil bir kez sallanır (docs/history/335-*); sayfa açılışında/okuma sayacı değişince değil.
  const [seenIncoming, setSeenIncoming] = useState(incoming);
  const [ringSeq, setRingSeq] = useState(0);
  if (incoming !== seenIncoming) {
    setSeenIncoming(incoming);
    if (incoming > seenIncoming) setRingSeq((n) => n + 1);
  }
  const wide = useMinWidth(768);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const label = unreadCount > 0 ? t("nc.bellAriaUnread", { count: unreadCount }) : t("header.notificationsAriaLabel");
  const badge =
    unreadCount > 0 ? (
      <span aria-hidden data-bell-badge="" className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-secondary px-1 text-[0.6875rem] font-bold leading-none text-primary-foreground">
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    ) : null;

  if (!wide) {
    return (
      <Link href="/notifications" aria-label={label} title={t("header.notificationsAriaLabel")} className={iconButtonClassName(false, "shrink-0 relative")}>
        <BellIcon size={20} strokeWidth={2} seq={ringSeq} />
        {badge}
      </Link>
    );
  }
  return (
    <>
      <button
        ref={setAnchor}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("header.notificationsAriaLabel")}
        data-notification-bell=""
        className={iconButtonClassName(open, "shrink-0 relative")}
      >
        <BellIcon size={20} strokeWidth={2} seq={ringSeq} />
        {badge}
      </button>
      {open && <NotificationPopover anchor={anchor} onClose={close} />}
    </>
  );
}
