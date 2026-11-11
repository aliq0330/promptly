"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const EDGE = 8;

/**
 * Pano açılır paneli (docs/history/367-*): düğmenin altına (yer yoksa üstüne) `position: fixed` ile, `body`'ye taşınarak açılır — `overflow` kırpan
 * ataların (tuval, araç çubuğu) içinde kesilmez. Dışarı tıklama / Escape kapatır; kaydırma ve boyut değişince yeniden konur.
 * İçerik kendi kartını çizmez: kart kabuğu burada (kenarlık, gölge, yuvarlak köşe).
 */
export function BoardPopover({
  anchorRef,
  onClose,
  align = "left",
  width = 320,
  className,
  children,
  label,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: "left" | "right";
  width?: number;
  className?: string;
  children: ReactNode;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = ref.current;
    if (!anchor || !menu) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const viewTop = viewport?.offsetTop ?? 0;
    const w = Math.min(width, window.innerWidth - EDGE * 2);
    const h = menu.offsetHeight;
    let left = align === "right" ? rect.right - w : rect.left;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - w - EDGE));
    const below = rect.bottom + 6;
    const fitsBelow = below + h + EDGE <= viewTop + viewHeight;
    const above = rect.top - 6 - h;
    const top = fitsBelow || above < viewTop + EDGE ? Math.max(viewTop + EDGE, Math.min(below, viewTop + viewHeight - h - EDGE)) : above;
    setPos((current) => (current && current.left === left && current.top === top ? current : { left, top }));
  }, [anchorRef, align, width]);

  useLayoutEffect(() => {
    place();
  }, [place, children]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return;
      // Panelin içindeki ⋯ menüsü (SpaceMenu) `body`'ye taşınır: onun tıklaması "dışarı" sayılıp paneli kapatmamalı.
      if ((target as Element).closest?.('[role="menu"]')) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onScroll = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return;
      place();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, onClose, place]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-board-popover=""
      className={cn("fixed z-[60] max-h-[min(80dvh,40rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border-soft bg-surface p-2 shadow-pop animate-pop-in", className)}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: Math.min(width, typeof window === "undefined" ? width : window.innerWidth - EDGE * 2) }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Açılır panelin satır düğmesi (simge + ad + isteğe bağlı ipucu). */
export function PopoverRow({
  icon,
  label,
  hint,
  onClick,
  tag,
  danger,
  disabled,
  trailing,
  testId,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
  tag?: string;
  danger?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-surface-soft disabled:opacity-45", danger ? "text-danger" : "text-text")}
    >
      {icon && <span aria-hidden className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px]", danger ? "bg-danger/10" : "bg-primary-soft text-primary")}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-bold">{label}</span>
        {hint && <span className="block text-caption leading-snug text-text-secondary">{hint}</span>}
      </span>
      {tag && <span className="shrink-0 rounded-full bg-primary-soft px-2 py-0.5 text-[0.6875rem] font-bold text-primary">{tag}</span>}
      {trailing}
    </button>
  );
}
