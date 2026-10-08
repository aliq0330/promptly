"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

export type ContentSortKey = "newest" | "oldest" | "most-liked";

export const SORT_LABELS: Record<ContentSortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
};

export const SORT_KEYS = Object.keys(SORT_LABELS) as ContentSortKey[];

/** The En yeni / En eski / En çok beğenilen select — same look as the profile toolbar. */
export function SortSelect({ value, onChange }: { value: ContentSortKey; onChange: (sort: ContentSortKey) => void }) {
  const { t } = useTranslation();
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as ContentSortKey)}
      aria-label={t("profile.sortAriaLabel")}
      className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-label font-medium text-text max-md:h-11 max-md:min-w-0 max-md:max-w-40 max-md:shrink max-md:flex-1 max-md:rounded-lg max-md:px-3"
    >
      {SORT_KEYS.map((key) => (
        <option key={key} value={key}>
          {t(SORT_LABELS[key])}
        </option>
      ))}
    </select>
  );
}
