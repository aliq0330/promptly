"use client";

import { CATEGORY_FILTERS, type NotificationCategory } from "@/lib/notification-utils";
import { cn } from "@/lib/utils";

/**
 * Category pills (Aşama 1.2) — purely a client-side filter over the
 * already-fetched notification list, so switching categories can never mark
 * anything read (there's no fetch or side effect here at all, just a
 * `setActive`). Horizontally scrollable rather than wrapping, so it never
 * grows the page width on a narrow phone regardless of label lengths.
 */
export function NotificationCategoryFilter({
  active,
  onChange,
}: {
  active: "all" | NotificationCategory;
  onChange: (category: "all" | NotificationCategory) => void;
}) {
  return (
    <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
      {CATEGORY_FILTERS.map((filter) => (
        <button
          key={filter.key}
          type="button"
          onClick={() => onChange(filter.key)}
          aria-pressed={active === filter.key}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            active === filter.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-text-muted hover:text-text",
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}
