"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { CONTROL_ICON_BUTTON } from "@/features/content/section-menu";
import { ListFilterSheet, SheetChips, SheetSection } from "@/features/content/list-toolbar";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import type { PromptContentType } from "@/types";

export type ProfileSortKey = "newest" | "oldest" | "most-liked";

const SORT_LABELS: Record<ProfileSortKey, TranslationKey> = {
  newest: "profile.sortNewest",
  oldest: "profile.sortOldest",
  "most-liked": "profile.sortMostLiked",
};

/**
 * The profile list's filters (docs/history/233-*): one quiet Filtre icon in the control row next to the section menu, opening the shared
 * `ListFilterSheet` with content type · sort · (long lists) search · Görünüm. The type chips only ever list content types that actually
 * occur in the current section's items (CLAUDE.md section 11) — never the full catalog, so a photographer's profile has no dead "Müzik" chip.
 */
export function ProfileFilterControl({
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
  const [open, setOpen] = useState(false);
  const activeCount = (activeType !== "all" ? 1 : 0) + (search.trim() ? 1 : 0);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={activeCount > 0 ? t("toolbar.filterWithCount", { count: activeCount }) : t("toolbar.filter")}
        title={t("toolbar.filter")}
        data-profile-filter
        className={cn(CONTROL_ICON_BUTTON, "relative")}
      >
        <SlidersHorizontal size={22} strokeWidth={1.75} aria-hidden />
        {activeCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold tabular-nums text-primary-foreground">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <ListFilterSheet
          onClose={() => setOpen(false)}
          activeCount={activeCount}
          onClear={hasActiveFilters ? onClear : undefined}
          sheetSections={
            <>
              <SheetSection title={t("toolbar.contentType")}>
                <SheetChips>
                  <Chip selected={activeType === "all"} onClick={() => onTypeChange("all")}>
                    {t("common.all")}
                  </Chip>
                  {availableTypes.map((type) => (
                    <Chip key={type} icon={CONTENT_TYPE_META[type].icon} selected={activeType === type} onClick={() => onTypeChange(type)}>
                      {t(CONTENT_TYPE_META[type].labelKey)}
                    </Chip>
                  ))}
                </SheetChips>
              </SheetSection>
              <SheetSection title={t("profile.sortAriaLabel")}>
                <SheetChips>
                  {(Object.keys(SORT_LABELS) as ProfileSortKey[]).map((key) => (
                    <Chip key={key} selected={sort === key} onClick={() => onSortChange(key)}>
                      {t(SORT_LABELS[key])}
                    </Chip>
                  ))}
                </SheetChips>
              </SheetSection>
              {showSearch && (
                <div className="flex h-10 items-center gap-2 rounded-md border border-border-soft bg-surface px-3 focus-within:border-primary">
                  <Search size={14} className="shrink-0 text-text-muted" aria-hidden />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t("profile.searchPlaceholder")}
                    aria-label={t("profile.searchPlaceholder")}
                    className="h-full w-full bg-transparent text-small text-text outline-none placeholder:text-text-muted"
                  />
                  {search && (
                    <button type="button" onClick={() => onSearchChange("")} aria-label={t("profile.clearFilters")} className="text-text-muted hover:text-text">
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            </>
          }
        />
      )}
    </>
  );
}
