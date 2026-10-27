"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

/**
 * Pano içi arama (docs/history/263-*, Ctrl/⌘+F): nesnelerin başlık / metin / not alanlarında arar; Enter ya da oklar sonuçlar arasında
 * gezdirir ve görünümü o nesneye götürür. Yalnız görünümü ve seçimi değiştirir. Arama metni `haystack`'ten gelir (çözülmüş başlık dahil).
 */
export function BoardSearch({
  haystack,
  onFocusItem,
  onClose,
}: {
  haystack: readonly { id: string; text: string }[];
  onFocusItem: (id: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const focusedFor = useRef("");
  useEffect(() => inputRef.current?.focus(), []);

  const needle = query.trim().toLocaleLowerCase();
  const matches = needle ? haystack.filter((entry) => entry.text.toLocaleLowerCase().includes(needle)).map((entry) => entry.id) : [];
  const current = matches.length ? Math.min(index, matches.length - 1) : 0;

  const go = (step: number) => {
    if (matches.length === 0) return;
    // Yeni aramada ilk ileri adım ilk sonuca (Enter), ilk geri adım sonuncuya gider.
    const base = focusedFor.current === needle ? current : step > 0 ? -1 : 0;
    focusedFor.current = needle;
    const next = (base + step + matches.length) % matches.length;
    setIndex(next);
    onFocusItem(matches[next]);
  };

  return (
    <div
      data-board-search=""
      role="search"
      className="pointer-events-auto absolute right-3 top-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-1 rounded-full border border-border-soft bg-surface py-1 pl-3 pr-1 shadow-pop"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <Search size={15} className="shrink-0 text-text-muted" aria-hidden />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(event.shiftKey ? -1 : 1);
          }
        }}
        placeholder={t("spaces.board.searchPlaceholder")}
        aria-label={t("spaces.board.search")}
        className="h-8 w-40 min-w-0 bg-transparent text-small text-text outline-none placeholder:text-text-muted sm:w-52"
      />
      <span data-search-count="" aria-live="polite" className={cn("shrink-0 px-1 text-caption tabular-nums", needle && matches.length === 0 ? "text-danger" : "text-text-muted")}>
        {needle ? (matches.length ? `${current + 1}/${matches.length}` : t("spaces.board.searchNone")) : ""}
      </span>
      <button type="button" aria-label={t("spaces.board.searchPrev")} onClick={() => go(-1)} disabled={matches.length === 0} className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft disabled:opacity-40">
        <ChevronUp size={16} aria-hidden />
      </button>
      <button type="button" aria-label={t("spaces.board.searchNext")} onClick={() => go(1)} disabled={matches.length === 0} className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft disabled:opacity-40">
        <ChevronDown size={16} aria-hidden />
      </button>
      <button type="button" aria-label={t("common.close")} onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft">
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}
