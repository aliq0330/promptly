"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CircleCheck, MessageSquareMore, MoreHorizontal } from "lucide-react";
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

/** Liste kontrol satırındaki `⋯` düğmesi: "Sohbet seç" ve "Tümü okundu". */
export function ConversationsMoreMenu({
  canSelect,
  canMarkAllRead,
  onSelect,
  onMarkAllRead,
}: {
  canSelect: boolean;
  canMarkAllRead: boolean;
  onSelect: () => void;
  onMarkAllRead: () => void;
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
        <MoreHorizontal size={22} strokeWidth={1.75} aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border border-border-soft bg-surface p-2 shadow-pop animate-pop-in">
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
            <CircleCheck size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
            {t("messages.selectChats")}
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
            <MessageSquareMore size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />
            {t("messages.markAllRead")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Seçim modunun başlığı: ✓ (seçimi bitir) + "N sohbet seçildi". */
export function SelectionHeader({ count, onDone, embedded }: { count: number; onDone: () => void; embedded?: boolean }) {
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
        <Check size={22} strokeWidth={2} aria-hidden />
      </button>
      <h1 aria-live="polite" className="font-display text-h2 font-bold tracking-[-0.01em] text-text">
        {count > 0 ? t("messages.selectionCount", { count }) : t("messages.selectChats")}
      </h1>
    </div>
  );
}

/**
 * Seçim modunun alt çubuğu: Arşivle · Okundu · Sil. Telefonda ekranın altına SABİT (`position: fixed`, liste altından kayar);
 * iki bölmeli masaüstü panelinde (`embedded`) panelin kendi alt kenarına yapışır. Hiçbir sohbet seçili değilken soluk ve basılamaz.
 */
export function SelectionActionBar({
  archiveLabel,
  disabled,
  busy,
  onArchive,
  onRead,
  onDelete,
  embedded,
}: {
  archiveLabel: string;
  disabled: boolean;
  busy: boolean;
  onArchive: () => void;
  onRead: () => void;
  onDelete: () => void;
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const pill =
    "pointer-events-auto h-12 rounded-full border border-border-soft bg-surface/95 px-6 text-body font-semibold text-text shadow-pop backdrop-blur-xl transition-[opacity,background-color] duration-200 ease-soft hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-45";
  return (
    <div
      role="toolbar"
      aria-label={t("messages.selectionBarAria")}
      data-selection-bar
      className={cn(
        "pointer-events-none z-40 flex items-center justify-between gap-2 px-4",
        embedded ? "sticky bottom-0 pb-4 pt-6" : "fixed inset-x-0 bottom-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
      )}
    >
      <button type="button" onClick={onArchive} disabled={disabled || busy} className={pill} data-selection-archive>
        {archiveLabel}
      </button>
      <button type="button" onClick={onRead} disabled={disabled || busy} className={pill} data-selection-read>
        {t("messages.markRead")}
      </button>
      <button type="button" onClick={onDelete} disabled={disabled || busy} className={cn(pill, "text-danger")} data-selection-delete>
        {t("common.delete")}
      </button>
    </div>
  );
}
