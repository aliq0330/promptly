"use client";

import { MenuRadioGroup } from "@/components/ui/menu-radio";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { ChevronDown } from "@/components/icons/chevron-down";
import { Modal } from "@/components/ui/modal";
import { focusMenuItem, menuKeyDown } from "@/components/ui/menu-keys";
import { cn } from "@/lib/utils";
import { DialogShell } from "@/components/ui/dialog-shell";

/** Ortak sade kontrol satırı simge düğmesi (docs/history/231-*, 232-*): arama · filtre · görünüm · "+". */
export const CONTROL_ICON_BUTTON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-sm text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** sm+ = açılır kutu, altı = alt sayfa (paylaşılan `Modal`). */
function useWide() {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(min-width: 640px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => false,
  );
}

export interface SectionMenuItem<K extends string> {
  key: K;
  label: string;
  /** Bekleyen sayı (davet) — mavi rozet; düğmede mavi nokta da çıkarır. */
  count?: number;
  /** Bilgi amaçlı sayı (Profil: gönderi sayıları) — sağda sönük metin, nokta çıkarmaz. */
  meta?: number;
  icon?: IconComponent;
  /** Önceki satırdan ince çizgiyle ayrılan yeni grup (Keşfet, Profil, docs/history/233-*). */
  dividerBefore?: boolean;
}

/**
 * "Tümü ▾" (docs/history/231-*, Topluluklar 232-*): bölüm balonlarının/sekmelerinin yerini alan TEK menü. Telefonda alt sayfa, masaüstünde açılır kutu; bekleyen
 * davet varken düğmede mavi nokta, "Davetler" satırında sayaç. Aynı seçenekler (Tümü · Benim · Paylaşılan · Sabitli · Herkese açık · Arşiv · Davetler).
 */
export function SectionMenu<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  title,
  variant = "pill",
  align = "start",
  placeholder,
}: {
  items: SectionMenuItem<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  title: string;
  /** "tab": bir sekme satırının sonundaki "Daha fazla ▾" düğmesi (Profil, docs/history/243-*) — etkin bölüm menüde değilse `placeholder` yazar. */
  variant?: "pill" | "tab";
  /** Açılır kutunun hizası; satırın sonundaki düğme için "end". */
  align?: "start" | "end";
  placeholder?: string;
}) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeItem = items.find((item) => item.key === active);
  const current = activeItem ?? (variant === "tab" ? undefined : items[0]);
  const pending = items.find((item) => item.count)?.count ?? 0;

  useEffect(() => {
    if (!open || !wide) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, wide]);

  // Açılışta odak seçili satıra girer (klavyeyle gezilir; Escape odağı düğmeye geri verir).
  useEffect(() => {
    if (open && wide) focusMenuItem(listRef.current, '[role="radio"]');
  }, [open, wide]);

  const list = (
    <MenuRadioGroup<K>
      groupRef={listRef}
      ariaLabel={ariaLabel}
      size="lg"
      value={active}
      onKeyDown={(event) => menuKeyDown(event, listRef.current, '[role="radio"]')}
      onChange={(key) => {
        onChange(key);
        setOpen(false);
      }}
      items={items.map((item) => ({ key: item.key, label: item.label, icon: item.icon, meta: item.meta, count: item.count, dividerBefore: item.dividerBefore || item.key === "invites", attrs: { "data-section-option": item.key } }))}
    />
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        data-section-menu
        data-section-trigger={variant}
        className={cn(
          "relative inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          variant === "tab"
            ? cn(
                "-mb-px h-11 gap-1.5 whitespace-nowrap border-b-2 px-3 text-body transition-colors",
                activeItem ? "border-primary font-semibold text-text" : "border-transparent font-medium text-text-secondary hover:text-text",
              )
            : "h-11 gap-2 rounded-sm bg-surface-soft pl-4 pr-3 text-body font-semibold text-text transition-colors hover:bg-border-soft",
        )}
      >
        {current?.label ?? placeholder}
        <ChevronDown size={variant === "tab" ? 16 : 18} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        {pending > 0 && <span aria-hidden data-section-dot className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />}
      </button>
      {open && wide && (
        <div className={cn("absolute top-full z-40 mt-2 w-72 rounded-lg card-flat p-2 shadow-pop animate-pop-in", align === "end" ? "right-0" : "left-0")}>{list}</div>
      )}
      {open && !wide && (
        <Modal onClose={() => setOpen(false)} labelledBy="section-menu-title" variant="sheet">
          <DialogShell role="document" className="max-h-[85dvh] w-full overflow-y-auto rounded-t-xl bg-surface px-4 pb-6 pt-3 shadow-pop">
            <h2 id="section-menu-title" className="px-3 pb-2 text-h3 font-bold text-text">
              {title}
            </h2>
            {list}
          </DialogShell>
        </Modal>
      )}
    </div>
  );
}

