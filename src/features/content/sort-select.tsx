"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

export type ContentSortKey = "newest" | "oldest" | "most-liked";

const SORT_LABELS: Record<ContentSortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
};

/** The En yeni / En eski / En çok beğenilen select — same look as the profile toolbar. */
export function SortSelect({ value, onChange }: { value: ContentSortKey; onChange: (sort: ContentSortKey) => void }) {
  const { t } = useTranslation();
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as ContentSortKey)}
      aria-label={t("profile.sortAriaLabel")}
      className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-label font-medium text-text"
    >
      {(Object.keys(SORT_LABELS) as ContentSortKey[]).map((key) => (
        <option key={key} value={key}>
          {t(SORT_LABELS[key])}
        </option>
      ))}
    </select>
  );
}

/**
 * One line: the type chips scroll horizontally on the left, the sort select
 * stays pinned on the right (never wraps to a second line on mobile — same
 * layout as the profile toolbar).
 */
export function ChipSortRow({ sort, className, children }: { sort: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div className="scrollbar-none flex min-w-0 flex-1 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain">{children}</div>
      {sort}
    </div>
  );
}
