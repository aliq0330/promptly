"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export interface SpaceMenuItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/**
 * Spaces'in ⋮ menüsü (kart, bant, öğe): dışarı tıklama / Escape kapatır, ok tuşlarıyla gezilir. Kartın bağlantısına tıklama
 * olarak geçmesin diye olaylar durdurulur.
 */
export function SpaceMenu({ items, label, align = "right", trigger, className }: { items: SpaceMenuItem[]; label?: string; align?: "left" | "right"; trigger?: ReactNode; className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // İlk öğeye odak (klavyeyle açıldığında da gezilebilir).
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {trigger ?? <MoreVertical size={18} aria-hidden />}
      </button>
      {open && (
        <div
          role="menu"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
            const index = nodes.indexOf(document.activeElement as HTMLElement);
            nodes[(index + (event.key === "ArrowDown" ? 1 : -1) + nodes.length) % nodes.length]?.focus();
          }}
          className={cn(
            "absolute top-full z-40 mt-1 w-56 overflow-hidden rounded-md border border-border-soft bg-surface-elevated py-1 shadow-pop animate-pop-in",
            align === "right" ? "right-0" : "left-0",
          )}
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
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2.5 text-left text-small focus:bg-surface-soft focus:outline-none",
                item.danger ? "text-danger hover:bg-danger/10" : "text-text hover:bg-surface-soft",
              )}
            >
              <item.icon size={15} aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
