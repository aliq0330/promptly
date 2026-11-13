"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "@/components/icons/check";
import { CircleCheck } from "@/components/icons/circle-check";
import { CheckCheck } from "@/components/icons/check-check";
import { MoreVertical } from "@/components/icons/more-vertical";
import { CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";

/** Seçim modu açıkken telefonda üst/alt uygulama menüleri gizlenir (`html[data-chat-select]`, globals.css) — yerlerini seçim çubukları alır. */
export function useSelectionChrome(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    root.setAttribute("data-chat-select", "");
    return () => root.removeAttribute("data-chat-select");
  }, [active]);
}

/** Liste kontrol satırındaki `⋯` düğmesi: "Sohbet seç" ve "Tümü okundu". Kanal/oda listeleri aynı menüyü kendi seçme adıyla kullanır (`selectLabel`, docs/history/381-*). */
export function ConversationsMoreMenu({
  canSelect,
  canMarkAllRead,
  onSelect,
  onMarkAllRead,
  selectLabel,
}: {
  canSelect: boolean;
  canMarkAllRead: boolean;
  onSelect: () => void;
  onMarkAllRead: () => void;
  selectLabel?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass =
    "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-body text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("messages.moreActionsAria")}
        title={t("messages.moreActionsAria")}
        data-conversations-more
        className={cn(CONTROL_ICON_BUTTON, "bg-surface-soft hover:bg-border-soft", open && "bg-border-soft")}
      >
        <MoreVertical size={24} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-lg border border-border-soft bg-surface-elevated p-2 shadow-pop animate-pop-in">
          <button
            type="button"
            role="menuitem"
            disabled={!canSelect}
            onClick={() => {
              setOpen(false);
              onSelect();
            }}
            data-conversations-select
            className={itemClass}
          >
            <CircleCheck size={20} aria-hidden className="shrink-0 text-text-muted" />
            {selectLabel ?? t("messages.selectChats")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canMarkAllRead}
            onClick={() => {
              setOpen(false);
              onMarkAllRead();
            }}
            data-conversations-mark-all
            className={itemClass}
          >
            <CheckCheck size={20} aria-hidden className="shrink-0 text-text-muted" />
            {t("messages.markAllRead")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Seçim modunun başlığı: ✓ (seçimi bitir) + "N sohbet seçildi". `title` kanal/oda listelerinde kendi cümlesini ("2 kanal seçildi") verir. */
export function SelectionHeader({ count, onDone, embedded, title }: { count: number; onDone: () => void; embedded?: boolean; title?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cn("mb-3 flex items-center gap-4", embedded ? "min-h-11" : "min-h-14")} data-selection-header>
      <button
        type="button"
        onClick={onDone}
        aria-label={t("messages.selectionDone")}
        title={t("messages.selectionDone")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-text shadow-card transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <Check size={24} aria-hidden />
      </button>
      <h1 aria-live="polite" className="font-display text-h2 font-bold tracking-[-0.01em] text-text">
        {title ?? (count > 0 ? t("messages.selectionCount", { count }) : t("messages.selectChats"))}
      </h1>
    </div>
  );
}

/**
 * Seçim modunun alt çubuğu: Arşivle · Sabitle · Okundu · Sessize al · Sil. Telefonda ekranın altına SABİT (`position: fixed`, liste altından kayar);
 * iki bölmeli masaüstü panelinde (`embedded`) panelin kendi alt kenarına yapışır. Hiçbir sohbet seçili değilken soluk ve basılamaz.
 * Her eylem isteğe bağlıdır: verilmeyen düğme çizilmez (sohbet listesi Arşivle/Sabitle/Okundu/Sil, kanal listeleri Sabitle/Okundu/Sessize al/Sil kullanır).
 */
export function SelectionActionBar({
  archiveLabel,
  disabled,
  busy,
  onArchive,
  onRead,
  onDelete,
  onPin,
  pinLabel,
  onMute,
  muteLabel,
  deleteDisabled,
  compact,
  embedded,
}: {
  archiveLabel?: string;
  disabled: boolean;
  busy: boolean;
  onArchive?: () => void;
  onRead: () => void;
  onDelete?: () => void;
  /** Sabitle / Sabitlemeyi kaldır (docs/history/352-*): verilirse Arşivle'nin yanında dördüncü düğme çıkar. */
  onPin?: () => void;
  pinLabel?: string;
  /** Sessize al / Sesi aç (kanal ve oda listeleri, docs/history/381-*). */
  onMute?: () => void;
  muteLabel?: string;
  /** Sil görünür ama seçimde silinemeyen satır var (varsayılan/ana kanal, proje): soluk ve basılamaz. */
  deleteDisabled?: boolean;
  /** Dört düğme dar bir sütuna/telefona sığsın: daha az iç boşluk, küçük yazı, tek satır (kanal listeleri, docs/history/381-*). */
  compact?: boolean;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const pill = cn(
    "pointer-events-auto h-12 rounded-full border border-border-soft bg-surface/95 font-semibold text-text shadow-pop backdrop-blur-xl transition-[opacity,background-color] duration-200 ease-soft hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
    compact ? "h-11 shrink-0 whitespace-nowrap px-2.5 text-[0.8125rem]" : "px-4 text-body sm:px-6",
  );
  return (
    <div
      role="toolbar"
      aria-label={t("messages.selectionBarAria")}
      data-selection-bar
      className={cn(
        "pointer-events-none z-40 flex items-center justify-between",
        compact ? "gap-1.5 px-3" : "gap-2 px-4",
        embedded ? "sticky bottom-0 mt-auto pb-4 pt-6" : "fixed inset-x-0 bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
      )}
    >
      {onArchive && (
        <button type="button" onClick={onArchive} disabled={disabled || busy} className={pill} data-selection-archive>
          {archiveLabel}
        </button>
      )}
      {onPin && (
        <button type="button" onClick={onPin} disabled={disabled || busy} className={pill} data-selection-pin>
          {pinLabel}
        </button>
      )}
      <button type="button" onClick={onRead} disabled={disabled || busy} className={pill} data-selection-read>
        {t("messages.markRead")}
      </button>
      {onMute && (
        <button type="button" onClick={onMute} disabled={disabled || busy} className={pill} data-selection-mute>
          {muteLabel}
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} disabled={disabled || busy || deleteDisabled} className={cn(pill, "text-danger")} data-selection-delete>
          {t("common.delete")}
        </button>
      )}
    </div>
  );
}
