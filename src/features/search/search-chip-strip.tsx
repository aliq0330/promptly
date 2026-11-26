"use client";

import { X } from "@/components/icons/x";
import { ScrollRow } from "@/components/ui/scroll-row";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import { tokenChip } from "./search-chip-meta";
import { tokenKey, type SearchToken } from "./search-tokens";

/**
 * The chips of a search in ONE scrolling line (never wrapping), with "Temizle" at the end — under the page's search box and inside the
 * full-screen search layer (docs/history/269-*, 421-*). `pendingKey` = the chip the next Backspace removes (ring).
 */
export function SearchChipStrip({
  tokens,
  onRemove,
  onClear,
  pendingKey,
  className,
}: {
  tokens: SearchToken[];
  onRemove: (key: string) => void;
  onClear: () => void;
  pendingKey?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  if (tokens.length === 0) return null;
  return (
    <ScrollRow role="group" aria-label={t("search.chipsAria")} wrapperClassName={className} className="-mx-3 items-center gap-2 px-3 sm:mx-0 sm:px-0">
      {tokens.map((token) => {
        const { icon: Icon, label } = tokenChip(token, t);
        const key = tokenKey(token);
        return (
          <span
            key={key}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm bg-primary-soft pl-3 pr-1 text-label font-medium whitespace-nowrap text-text",
              pendingKey === key && "ring-2 ring-primary",
            )}
          >
            <Icon size={16} className="text-primary-text" aria-hidden />
            <span>{label}</span>
            <button
              type="button"
              aria-label={`${t("search.removeFilter")}: ${label}`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove(key);
              }}
              className="flex h-9 w-9 items-center justify-center rounded-sm text-text-muted hover:bg-surface hover:text-text"
            >
              <X size={16} />
            </button>
          </span>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        className="inline-flex h-9 shrink-0 items-center px-2 text-label font-semibold whitespace-nowrap text-primary-text hover:text-primary-hover"
      >
        {t("search.clear")}
      </button>
    </ScrollRow>
  );
}
