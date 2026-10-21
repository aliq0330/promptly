"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

export type ContentSortKey = "newest" | "oldest" | "most-liked" | "most-used";

export const SORT_LABELS: Record<ContentSortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
  "most-used": "profile.sortMostUsed",
};

/** The sorts every list offers. "most-used" is opt-in (`keys`): only prompts have a use counter, so only Keşfet's Promptlar section shows it. */
export const SORT_KEYS: ContentSortKey[] = ["newest", "oldest", "most-liked"];

/** The En yeni / En eski / En çok beğenilen select — same look as the profile toolbar. */
export function SortSelect({
  value,
  onChange,
  keys = SORT_KEYS,
  quiet,
}: {
  value: ContentSortKey;
  onChange: (sort: ContentSortKey) => void;
  keys?: ContentSortKey[];
  /** Borderless text-style select for a calm control row (`SectionNav`). */
  quiet?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as ContentSortKey)}
      aria-label={t("profile.sortAriaLabel")}
      className={
        quiet
          ? "h-10 min-w-0 max-w-full shrink cursor-pointer rounded-full bg-transparent pl-1 pr-2 text-body font-semibold text-text hover:bg-surface-soft"
          : "h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-label font-medium text-text max-md:h-11 max-md:min-w-0 max-md:max-w-40 max-md:shrink max-md:flex-1 max-md:rounded-lg max-md:px-3"
      }
    >
      {keys.map((key) => (
        <option key={key} value={key}>
          {t(SORT_LABELS[key])}
        </option>
      ))}
    </select>
  );
}
