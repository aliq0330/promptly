"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { IconComponent } from "@/components/icons/icon";
import { MoreVertical } from "@/components/icons/more-vertical";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_PANEL_CLASS } from "@/components/ui/menu";
import { menuKeyDown } from "@/components/ui/menu-keys";

export interface PopoverMenuItem {
  key: string;
  label: string;
  icon: IconComponent;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

const MENU_WIDTH = 224;
const EDGE = 8;

/**
 * Spaces'in ⋮ menüsü (kart, bant, öğe, pano araç çubukları): dışarı tıklama / Escape kapatır, ok tuşlarıyla gezilir. Kartın bağlantısına tıklama
 * olarak geçmesin diye olaylar durdurulur. Menü `body`'ye taşınır ve `position: fixed` ile düğmenin yanına konur — `overflow` kırpan
 * ataların (yatay kaydırmalı pano araç çubuğu, kart) içinde kesilmesin; yer yoksa düğmenin ÜSTÜNE açılır, kaydırma/boyut değişince yeniden konur.
 */
export function PopoverMenu({ items, label, align = "right", trigger, className, triggerClassName }: { items: PopoverMenuItem[]; label?: string; align?: "left" | "right"; trigger?: ReactNode; className?: string; triggerClassName?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const visible = items.filter((item) => !item.hidden);

  // Konum: düğmenin altı; yer yoksa üstü. Yatayda ekran kenarına sıkıştırılır.
  const place = useCallback(() => {
    const button = ref.current?.querySelector("button");
    const menu = menuRef.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const viewTop = viewport?.offsetTop ?? 0;
    const height = menu.offsetHeight;
    const width = Math.min(MENU_WIDTH, window.innerWidth - EDGE * 2);
    let left = align === "right" ? rect.right - width : rect.left;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));
    const below = rect.bottom + 4;
    const fitsBelow = below + height + EDGE <= viewTop + viewHeight;
    const above = rect.top - 4 - height;
    const top = fitsBelow || above < viewTop + EDGE ? Math.max(viewTop + EDGE, Math.min(below, viewTop + viewHeight - height - EDGE)) : above;
    setPos((current) => (current && current.left === left && current.top === top ? current : { left, top }));
  }, [align]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    // Kaydırma/boyut değişince menü düğmesini izler (araç çubuğu kendiliğinden kayabilir).
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      place();
    };
    const onResize = () => place();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, place]);

  // İlk konum: tarayıcı boyamadan önce (menü açılışta ölçülür); ilk öğeye odak (klavyeyle açıldığında da gezilebilir).
  useLayoutEffect(() => {
    if (!open) return;
    place();
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, place]);

  if (visible.length === 0) return null;

  return (
    <div ref={ref} className={cn("relative shrink-0", className)} onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? t("spaces.menu.more")}
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        className={triggerClassName ?? "flex h-9 w-9 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"}
      >
        {trigger ?? <MoreVertical size={20} aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => menuKeyDown(event, menuRef.current)}
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, width: MENU_WIDTH, maxWidth: `calc(100vw - ${EDGE * 2}px)` }}
            className={cn(MENU_PANEL_CLASS, "fixed z-(--z-popover)")}
          >
            {visible.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.preventDefault();
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(MENU_ITEM_CLASS, item.danger && MENU_ITEM_DANGER_CLASS)}
              >
                <item.icon size={16} aria-hidden />
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
