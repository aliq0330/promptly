"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Search } from "@/components/icons/search";
import { X } from "@/components/icons/x";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SearchChipStrip } from "./search-chip-strip";
import { SearchOverlay, type SearchOverlayFilters } from "./search-overlay";
import { tokenKey, type SearchToken } from "./search-tokens";

/**
 * The search box. It is only the DOOR (docs/history/421-*): one text row showing the current query and, under it, the chips in a single
 * scrolling strip (never wrapping into the box). Tapping it opens the full-screen search layer (`SearchOverlay`) — suggestions, recent
 * searches, chips and Filtre live there, so on a phone the on-screen keyboard no longer covers the page's Filtre row. Users, tags (only
 * real ones), media type, content type and tools become removable chips; free text keeps working next to them. Typing `@` / `#` in the
 * layer narrows the list to people / tags and Enter takes the first one. Typing a letter while the box has the focus opens the layer with it.
 */
export function AdvancedSearchBox({
  tokens,
  onTokensChange,
  text,
  onTextChange,
  autoFocus,
  hideKindSuggestions,
  placeholder,
  filters,
}: {
  tokens: SearchToken[];
  onTokensChange: (next: SearchToken[]) => void;
  text: string;
  onTextChange: (next: string) => void;
  /** Focuses the box (it does NOT open the layer — a `?q=` link would otherwise land on a covered page). */
  autoFocus?: boolean;
  /** Single-type list pages: the content-type (prompt/request/…) chips are pointless there. */
  hideKindSuggestions?: boolean;
  /** Page-specific placeholder ("Workflow ara"…); defaults to the site-wide one. */
  placeholder?: string;
  /** What the layer's Filtre mode edits; left out = the layer has no Filtre (a page whose filters live elsewhere). */
  filters?: SearchOverlayFilters;
}) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  function close() {
    setOpen(false);
    // The box gets the focus back (it is read-only, so no keyboard comes up).
    requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // Typing from the keyboard: the letter starts the query inside the layer.
      event.preventDefault();
      onTextChange(text + event.key);
      setOpen(true);
    }
  }

  const label = placeholder ?? t("search.placeholder");

  return (
    <div className="relative">
      <div
        role="search"
        onClick={() => setOpen(true)}
        className="relative flex h-[3.25rem] w-full cursor-text items-center rounded-sm border border-transparent bg-surface-soft pl-12 pr-1.5 transition-colors focus-within:border-focus focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/20"
      >
        <Search size={20} className="pointer-events-none absolute left-4 top-[1.0625rem] text-text-muted" />
        <input
          ref={triggerRef}
          type="text"
          readOnly
          role="combobox"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? "search-overlay" : undefined}
          aria-label={label}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          onKeyDown={handleKeyDown}
          placeholder={tokens.length ? t("search.chipPlaceholder") : label}
          className="h-full min-w-0 flex-1 cursor-text bg-transparent text-small text-text placeholder:text-text-muted focus:outline-none"
        />
        {text && (
          <button
            type="button"
            aria-label={t("search.clearText")}
            onClick={(event) => {
              event.stopPropagation();
              onTextChange("");
            }}
            className={iconButtonClassName(false, "h-9 w-9")}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <SearchChipStrip
        tokens={tokens}
        onRemove={(key) => onTokensChange(tokens.filter((token) => tokenKey(token) !== key))}
        onClear={() => {
          onTokensChange([]);
          onTextChange("");
        }}
        className="mt-2.5"
      />

      {open && (
        <SearchOverlay
          tokens={tokens}
          onTokensChange={onTokensChange}
          text={text}
          onTextChange={onTextChange}
          placeholder={placeholder}
          hideKindSuggestions={hideKindSuggestions}
          filters={filters}
          onClose={close}
        />
      )}
    </div>
  );
}
