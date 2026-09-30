"use client";

import { Chip } from "@/components/ui/chip";

import { Search, X } from "lucide-react";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PromptContentType } from "@/types";

export type ProfileSortKey = "newest" | "oldest" | "most-liked";

const SORT_LABELS: Record<ProfileSortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
};

/**
 * Filter chips only ever list content types that actually occur in the
 * current tab's items (CLAUDE.md section 11) — never the full catalog,
 * so a photographer's profile doesn't show a dead "Müzik" chip.
 */
export function ProfileToolbar({
  availableTypes,
  activeType,
  onTypeChange,
  sort,
  onSortChange,
  search,
  onSearchChange,
  showSearch,
  hasActiveFilters,
  onClear,
}: {
  availableTypes: PromptContentType[];
  activeType: PromptContentType | "all";
  onTypeChange: (type: PromptContentType | "all") => void;
  sort: ProfileSortKey;
  onSortChange: (sort: ProfileSortKey) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showSearch: boolean;
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="scrollbar-none flex flex-1 touch-pan-x gap-2 overflow-x-auto overscroll-x-contain">
          <Chip selected={activeType === "all"} onClick={() => onTypeChange("all")}>
            {t("common.all")}
          </Chip>
          {availableTypes.map((type) => (
            <Chip key={type} icon={CONTENT_TYPE_META[type].icon} selected={activeType === type} onClick={() => onTypeChange(type)}>
              {t(CONTENT_TYPE_META[type].labelKey)}
            </Chip>
          ))}
        </div>

        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as ProfileSortKey)}
          aria-label={t("profile.sortAriaLabel")}
          className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-label font-medium text-text"
        >
          {(Object.keys(SORT_LABELS) as ProfileSortKey[]).map((key) => (
            <option key={key} value={key}>
              {t(SORT_LABELS[key])}
            </option>
          ))}
        </select>
      </div>

      {showSearch && (
        <div className="flex items-center gap-2">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-border-soft bg-surface px-3 focus-within:border-primary">
            <Search size={14} className="shrink-0 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={t("profile.searchPlaceholder")}
              className="h-full w-full bg-transparent text-small text-text outline-none placeholder:text-text-muted"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClear}
              className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <X size={12} />
              {t("profile.clearFilters")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
