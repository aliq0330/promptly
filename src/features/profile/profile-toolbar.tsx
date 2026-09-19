"use client";

import { Search, X } from "lucide-react";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import { cn } from "@/lib/utils";
import type { PromptContentType } from "@/types";

export type ProfileSortKey = "newest" | "oldest" | "most-liked" | "most-remixed";

const SORT_LABELS: Record<ProfileSortKey, string> = {
  newest: "En yeni",
  oldest: "En eski",
  "most-liked": "En çok beğenilen",
  "most-remixed": "En çok remixlenen",
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
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => onTypeChange("all")}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeType === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-text-muted hover:text-text",
            )}
          >
            Tümü
          </button>
          {availableTypes.map((type) => {
            const meta = CONTENT_TYPE_META[type];
            const Icon = meta.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onTypeChange(type)}
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  activeType === type
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-text-muted hover:text-text",
                )}
              >
                <Icon size={12} />
                {meta.label}
              </button>
            );
          })}
        </div>

        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as ProfileSortKey)}
          aria-label="Sırala"
          className="h-8 shrink-0 rounded-md border border-border bg-surface px-2 text-xs font-medium text-text"
        >
          {(Object.keys(SORT_LABELS) as ProfileSortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      {showSearch && (
        <div className="flex items-center gap-2">
          <div className="flex h-9 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3">
            <Search size={14} className="shrink-0 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Bu profildeki promptlarda ara"
              className="h-full w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
            />
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClear}
              className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-text-muted transition-colors hover:text-text"
            >
              <X size={12} />
              Temizle
            </button>
          )}
        </div>
      )}
    </div>
  );
}
