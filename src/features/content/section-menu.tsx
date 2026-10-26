"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** Ortak sade kontrol satırı simge düğmesi (docs/history/231-*, 232-*): arama · filtre · görünüm · "+". */
export const CONTROL_ICON_BUTTON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-text transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

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
  icon?: LucideIcon;
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
  const activeItem = items.find((item) => item.key === active);
  const current = activeItem ?? (variant === "tab" ? undefined : items[0]);
  const pending = items.find((item) => item.count)?.count ?? 0;

  useEffect(() => {
    if (!open || !wide) return;
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
  }, [open, wide]);

  const list = (
    <div role="radiogroup" aria-label={ariaLabel} className="space-y-0.5">
      {items.map((item) => {
        const selected = item.key === active;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="radio"
            aria-checked={selected}
            data-section-option={item.key}
            onClick={() => {
              onChange(item.key);
              setOpen(false);
            }}
            className={cn(
              "flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left text-body transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              selected ? "font-semibold text-text" : "text-text-secondary",
              (item.dividerBefore || item.key === "invites") && "mt-1 border-t border-border-soft pt-1",
            )}
          >
            {Icon && <Icon size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-muted" />}
            <span className="flex-1">{item.label}</span>
            {item.meta ? <span data-section-meta className="text-small tabular-nums text-text-muted">{item.meta}</span> : null}
            {item.count ? <span className="grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1.5 text-caption font-bold text-primary-foreground">{item.count}</span> : null}
            {selected && <Check size={18} className="text-primary" aria-hidden />}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        data-section-menu
        data-section-trigger={variant}
        className={cn(
          "relative inline-flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          variant === "tab"
            ? cn(
                "-mb-px h-11 gap-1.5 whitespace-nowrap border-b-2 px-3 text-body transition-colors",
                activeItem ? "border-primary font-semibold text-text" : "border-transparent font-medium text-text-secondary hover:text-text",
              )
            : "h-11 gap-2 rounded-xl bg-surface-soft pl-4 pr-3 text-body font-semibold text-text transition-colors hover:bg-border-soft",
        )}
      >
        {current?.label ?? placeholder}
        <ChevronDown size={variant === "tab" ? 16 : 18} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        {pending > 0 && <span aria-hidden data-section-dot className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />}
      </button>
      {open && wide && (
        <div className={cn("absolute top-full z-40 mt-2 w-72 rounded-xl border border-border-soft bg-surface p-2 shadow-pop animate-pop-in", align === "end" ? "right-0" : "left-0")}>{list}</div>
      )}
      {open && !wide && (
        <Modal onClose={() => setOpen(false)} labelledBy="section-menu-title" variant="sheet">
          <div role="document" onClick={(event) => event.stopPropagation()} className="max-h-[85dvh] w-full overflow-y-auto rounded-t-xl bg-surface px-4 pb-6 pt-3 shadow-pop">
            <h2 id="section-menu-title" className="px-3 pb-2 text-h3 font-semibold text-text">
              {title}
            </h2>
            {list}
          </div>
        </Modal>
      )}
    </div>
  );
}

