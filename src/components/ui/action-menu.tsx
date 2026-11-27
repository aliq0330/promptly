"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "@/components/icons/check";
import { Ellipsis } from "@/components/icons/ellipsis";
import { DialogShell } from "@/components/ui/dialog-shell";
import { MENU_ITEM_CLASS, MENU_PANEL_CLASS } from "@/components/ui/menu";
import { focusMenuItem, menuKeyDown } from "@/components/ui/menu-keys";
import { Modal } from "@/components/ui/modal";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Gönderi ⋮ menüsünün kabuğu (docs/history/480-*): yatay üç nokta düğmesi + içerik. Masaüstü ve tablette (`md`+) düğmenin altında açılır panel;
 * telefonda (`< md`) alttan açılan kart (`Modal`, aşağı sürükleyince kapanır) — satırlar parmağa uygun yükseklikte. İçerik `children(close)` ile
 * YALNIZ açıkken kurulur (satırların kancaları — takip/engel/ilgi durumu — menü kapalıyken hiçbir istek atmaz). Pencereler (Paylaş, Space…) menünün
 * içinde değil çağıranın bileşeninde durur; menü kapanınca içerik söner, pencere kalır.
 *
 * `surface="detail"`: bant köşesindeki düğme kenarlıklı 40 px ve 20 px ikon (kartlardaki sessiz düğmeden belirgin).
 */
export type ActionMenuTone = "default" | "danger" | "positive";

export interface ActionMenuRow {
  key: string;
  label: string;
  icon: ReactNode;
  /** Satırın grubu: sıralı listede grup değişince ince ayırıcı çizgi çizilir. */
  group: string;
  tone?: ActionMenuTone;
  onSelect?: () => void;
  /** Bağlantı satırı (`onSelect` yerine). */
  href?: string;
  /** Seçince menü kapanmaz (iki adımlı onay gibi). */
  keepOpen?: boolean;
  /** İki durumlu satır: işaretli gösterilir (`menuitemcheckbox`). */
  selected?: boolean;
  disabled?: boolean;
  /** Test/erişilebilirlik kancaları (`data-*`). */
  attrs?: Record<`data-${string}`, string>;
}

const TONE_CLASS: Record<ActionMenuTone, string> = {
  default: "",
  danger: "text-danger hover:bg-danger-soft focus-visible:bg-danger-soft",
  positive: "text-success hover:bg-success-soft focus-visible:bg-success-soft",
};

const TRIGGER_CLASS = {
  card: "flex h-9 w-9 items-center justify-center rounded-sm text-text-muted transition-colors duration-200 hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  detail:
    "flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-surface text-text shadow-xs transition-colors duration-200 hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
} as const;

/** Satırlar (sıralı): grup değişince ayırıcı çizer; `sheet` telefondaki alt kart için daha yüksek satırlar kullanır. */
export function ActionMenuRows({ rows, close, sheet = false }: { rows: ActionMenuRow[]; close: () => void; sheet?: boolean }) {
  return (
    <>
      {rows.map((row, index) => {
        const previous = rows[index - 1];
        const rowClass = cn(MENU_ITEM_CLASS, sheet && "min-h-11 gap-3 px-4 py-2 text-body", TONE_CLASS[row.tone ?? "default"], row.selected && "font-semibold");
        const face = (
          <>
            <span aria-hidden className="shrink-0">
              {row.icon}
            </span>
            <span className="min-w-0 flex-1">{row.label}</span>
            {row.selected && <Check size={16} aria-hidden className="shrink-0" />}
          </>
        );
        return (
          <div key={row.key} className="contents">
            {previous && previous.group !== row.group && <div role="separator" className="mx-3 my-1 h-px bg-border-soft" />}
            {row.href ? (
              <Link
                href={row.href}
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  close();
                }}
                className={rowClass}
                {...row.attrs}
              >
                {face}
              </Link>
            ) : (
              <button
                type="button"
                role={row.selected === undefined ? "menuitem" : "menuitemcheckbox"}
                aria-checked={row.selected}
                disabled={row.disabled}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!row.keepOpen) close();
                  row.onSelect?.();
                }}
                className={rowClass}
                {...row.attrs}
              >
                {face}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

export function ActionMenu({
  label,
  surface = "card",
  title,
  children,
  dataAttrs,
}: {
  /** Düğmenin erişilebilir adı. */
  label: string;
  surface?: "card" | "detail";
  /** Telefondaki alt kartın başlığı (verilmezse `label`). */
  title?: string;
  children: (close: () => void, context: { sheet: boolean }) => ReactNode;
  dataAttrs?: Record<`data-${string}`, string>;
}) {
  const [open, setOpen] = useState(false);
  const phone = useMediaQuery("(max-width: 767px)");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  // Masaüstü paneli: açılışta odak ilk satıra girer, dışarı tıklama / Escape kapatır ve odağı düğmeye geri verir.
  useEffect(() => {
    if (!open || phone) return;
    const timer = window.setTimeout(() => focusMenuItem(panelRef.current), 0);
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, phone]);

  return (
    <div ref={rootRef} className="relative z-20 shrink-0" {...dataAttrs}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-post-menu-trigger={surface}
        className={TRIGGER_CLASS[surface]}
      >
        <Ellipsis size={20} />
      </button>

      {open && !phone && (
        <div ref={panelRef} role="menu" aria-label={label} onKeyDown={(event) => menuKeyDown(event, panelRef.current)} className={cn(MENU_PANEL_CLASS, "absolute right-0 top-full z-30 mt-1 w-60")}>
          {children(close, { sheet: false })}
        </div>
      )}

      {open && phone && (
        // Portal'daki pencerenin olayları React ağacında kartın bağlantısına kadar kabarmasın (kart açılmasın).
        <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <Modal onClose={close} labelledBy="action-menu-title">
            <DialogShell className="flex w-full max-w-md flex-col overflow-hidden" data-post-menu-sheet="">
              <h2 id="action-menu-title" className="shrink-0 px-4 pb-1 pt-4 text-label font-semibold text-text-muted">
                {title ?? label}
              </h2>
              <div role="menu" aria-label={label} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
                {children(close, { sheet: true })}
              </div>
            </DialogShell>
          </Modal>
        </div>
      )}
    </div>
  );
}
