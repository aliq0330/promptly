"use client";

import { useMemo, useRef, useState } from "react";
import { GripVertical, Plus, Search, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { TokenTone } from "./prompt-doc-editor";

export interface PickerItem {
  id: string;
  /** Metne yazılacak `{ad}` içindeki ad. */
  name: string;
  label: string;
  description?: string;
  /** Hangi filtre grubuna girer (`PickerFilter.id`). */
  group: string;
  /** Metinde kaç yerde kullanılıyor. */
  usage: number;
}

export interface PickerFilter {
  id: string;
  label: string;
}

/**
 * Üç yüzeyin (alt sayfa / imleç yanı pencere / sağ panel) ortak içeriği:
 * başlık, arama, filtre çipleri, liste, yeni oluşturma ve (isteğe bağlı)
 * ek eylemler. Listeden bir satıra dokunmak `onPick`'i çağırır; masaüstünde
 * satır sürüklenip metne bırakılabilir (`text/plain` olarak `{ad}`).
 */
export function InsertPicker({
  title,
  items,
  filters,
  tone,
  searchPlaceholder,
  emptyText,
  createLabel,
  onPick,
  onCreate,
  onClose,
  draggable = false,
  autoFocusSearch = false,
  footer,
  className,
}: {
  title: string;
  items: PickerItem[];
  filters: PickerFilter[];
  tone: TokenTone;
  searchPlaceholder: string;
  emptyText: string;
  createLabel: string;
  onPick: (item: PickerItem) => void;
  onCreate?: () => void;
  onClose?: () => void;
  draggable?: boolean;
  autoFocusSearch?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const listRef = useRef<HTMLUListElement>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter === "unused" && item.usage > 0) return false;
      if (filter === "used" && item.usage === 0) return false;
      if (filter !== "all" && filter !== "unused" && filter !== "used" && item.group !== filter) return false;
      if (!q) return true;
      return `${item.label} ${item.description ?? ""}`.toLocaleLowerCase().includes(q);
    });
  }, [items, query, filter]);

  function focusItem(delta: number, from: HTMLElement | null) {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-pick]") ?? []);
    if (buttons.length === 0) return;
    const index = from ? buttons.indexOf(from as HTMLButtonElement) : -1;
    const next = Math.max(0, Math.min(buttons.length - 1, index + delta));
    buttons[next].focus();
  }

  const pillClass =
    tone === "field" ? "bg-secondary/15 text-secondary" : tone === "unknown" ? "bg-warning/15 text-warning" : "bg-primary-soft text-primary";

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
        <h2 id="insert-picker-title" className="text-sm font-semibold text-text">
          {title}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-soft hover:text-text"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="px-4 pb-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus={autoFocusSearch}
            data-autofocus={autoFocusSearch ? "" : undefined}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                focusItem(1, null);
              } else if (event.key === "Enter" && visible[0]) {
                event.preventDefault();
                onPick(visible[0]);
              }
            }}
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-text placeholder:text-text-muted shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60"
          />
        </div>
      </div>

      {filters.length > 1 && (
        <div className="scrollbar-none flex touch-pan-x gap-1.5 overflow-x-auto px-4 pb-2" role="group" aria-label={t("composer.filtersAria")}>
          {filters.map((entry) => (
            <Chip key={entry.id} selected={filter === entry.id} onClick={() => setFilter(entry.id)} className="h-7 px-2.5 text-caption">
              {entry.label}
            </Chip>
          ))}
        </div>
      )}

      <ul
        ref={listRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain px-2 pb-2"
        onKeyDown={(event) => {
          const target = event.target as HTMLElement;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            focusItem(1, target);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            focusItem(-1, target);
          }
        }}
      >
        {visible.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-text-muted">{items.length === 0 ? emptyText : t("composer.noResults")}</li>
        )}
        {visible.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-pick={item.id}
              draggable={draggable}
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", `{${item.name}}`);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onDragEnd={(event) => {
                if (event.dataTransfer.dropEffect !== "none") onClose?.();
              }}
              onClick={() => onPick(item)}
              aria-label={t("composer.insertAria", { name: item.label })}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-soft focus-visible:bg-surface-soft"
            >
              {draggable && <GripVertical size={14} className="shrink-0 text-text-muted" aria-hidden />}
              <span className="min-w-0 flex-1">
                <span className={cn("inline-block max-w-full truncate rounded-[5px] px-1.5 py-0.5 font-mono text-xs font-medium", pillClass)}>
                  {item.label}
                </span>
                {item.description && <span className="mt-0.5 block truncate text-caption text-text-muted">{item.description}</span>}
              </span>
              {item.usage > 0 && (
                <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-caption text-text-secondary">
                  {t("composer.usedTimes", { count: item.usage })}
                </span>
              )}
              <Plus size={16} className="shrink-0 text-text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-border-soft p-2">
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft"
          >
            <Plus size={16} /> {createLabel}
          </button>
        )}
        {footer}
      </div>
    </div>
  );
}
