"use client";

import { useLayoutEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, X } from "lucide-react";
import { Portal } from "@/components/ui/portal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

export interface ToolbarAction {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  primary?: boolean;
}

const EDGE = 8;

/**
 * Seçili metnin bağlamsal araç çubuğu.
 *  - `floating` (fare/klavye): seçimin üstünde (yer yoksa altında) süzülür,
 *    ekrandan taşmaz.
 *  - `docked` (dokunmatik): düzenleyicinin altına yerleşir — işletim
 *    sisteminin kendi kes/kopyala balonuyla çakışmaz.
 * "Metni düzenle" çubuğun içinde tek satırlık bir giriş açar.
 */
export function SelectionToolbar({
  mode,
  anchor,
  anchorKey,
  actions,
  editing,
  editValue,
  onEditValueChange,
  onEditApply,
  onEditCancel,
  label,
}: {
  mode: "floating" | "docked";
  anchor: () => DOMRect | null;
  /** Seçim değiştikçe değişen anahtar: konum yeniden hesaplanır. */
  anchorKey: string;
  actions: ToolbarAction[];
  editing: boolean;
  editValue: string;
  onEditValueChange: (value: string) => void;
  onEditApply: () => void;
  onEditCancel: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  // Portal çocukları ilk render'dan sonra bağlandığı için eleman bir state (callback ref).
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (mode !== "floating" || !el) return;
    function place() {
      const rect = anchor();
      if (!el || !rect) {
        setPosition(null);
        return;
      }
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const vw = window.innerWidth;
      const above = rect.top - height - 8;
      const top = above >= EDGE ? above : Math.min(rect.bottom + 8, window.innerHeight - height - EDGE);
      const left = Math.max(EDGE, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - EDGE));
      setPosition({ top, left });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `anchor` kimliği her render değişir; konum yalnızca seçim anahtarı/mod değişince yenilenir
  }, [mode, anchorKey, editing, el]);

  const body = (
    <div
      ref={setEl}
      role="toolbar"
      aria-label={label}
      data-selection-toolbar
      onMouseDown={(event) => {
        // Düğmeler odağı/seçimi çalmasın (düzenleme girişi hariç).
        if ((event.target as HTMLElement).tagName !== "INPUT") event.preventDefault();
      }}
      style={
        mode === "floating"
          ? { position: "fixed", top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }
          : undefined
      }
      className={cn(
        "flex items-center gap-1 border border-border bg-surface-elevated p-1 shadow-pop animate-pop-in",
        mode === "floating" ? "z-40 max-w-[calc(100vw-16px)] flex-wrap rounded-xl" : "flex-wrap rounded-xl",
      )}
    >
      {editing ? (
        // Yuvalı <form> geçersiz olurdu (yayın formunun içinde): div + Enter.
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={editValue}
            onChange={(event) => onEditValueChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                onEditApply();
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onEditCancel();
              }
            }}
            aria-label={t("composer.editTextAria")}
            className="h-9 w-56 max-w-[60vw] rounded-md border border-border bg-background px-2.5 text-sm text-text focus:border-primary/60"
          />
          <button
            type="button"
            onClick={onEditApply}
            aria-label={t("composer.apply")}
            className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            <Check size={16} />
          </button>
          <button
            type="button"
            onClick={onEditCancel}
            aria-label={t("common.cancelAction")}
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={action.onClick}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-label font-medium transition-colors",
              action.primary ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "text-text-secondary hover:bg-surface-soft hover:text-text",
            )}
          >
            <action.icon size={14} /> {action.label}
          </button>
        ))
      )}
    </div>
  );

  return mode === "floating" ? <Portal>{body}</Portal> : body;
}
