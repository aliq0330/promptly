"use client";

import { CATEGORY_FILTERS, type NotificationCategory } from "@/lib/notification-utils";
import { Chip, ChipRow } from "@/components/ui/chip";

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
    <ChipRow className="mb-4">
      {CATEGORY_FILTERS.map((filter) => (
        <Chip key={filter.key} selected={active === filter.key} onClick={() => onChange(filter.key)}>
          {filter.label}
        </Chip>
      ))}
    </ChipRow>
  );
}
