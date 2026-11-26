"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreVertical } from "@/components/icons/more-vertical";
import { MENU_ITEM_CLASS, MENU_ITEM_DANGER_CLASS, MENU_PANEL_CLASS } from "@/components/ui/menu";
import { focusMenuItem, menuKeyDown } from "@/components/ui/menu-keys";
import { cn } from "@/lib/utils";

/**
 * Küçük "⋮" açılır menüsü (dışarı tıklama ve Escape ile kapanır). `children(close)` menü öğelerini çizer.
 * `trigger` + `triggerClassName` verilirse düğme "⋮" yerine o içerikle çizilir (ör. "Katıldın ▼").
 */
export function DropdownMenu({
  label,
  children,
  trigger,
  triggerClassName,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
  trigger?: ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Açılışta odak ilk öğeye girer (klavyeyle açılan menü içinde gezilebilsin); Escape odağı düğmeye geri verir.
  useEffect(() => {
    if (open) focusMenuItem(panelRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={triggerClassName ?? "flex h-9 w-9 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"}
      >
        {trigger ?? <MoreVertical size={16} />}
      </button>
      {open && (
        <div ref={panelRef} role="menu" onKeyDown={(event) => menuKeyDown(event, panelRef.current)} className={cn(MENU_PANEL_CLASS, "absolute right-0 top-full z-30 mt-1 min-w-48")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, label, onClick, danger = false, disabled = false }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={cn(MENU_ITEM_CLASS, danger && MENU_ITEM_DANGER_CLASS)}>
      <span aria-hidden className="shrink-0">
        {icon}
      </span>
      {label}
    </button>
  );
}
