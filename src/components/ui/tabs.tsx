"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

/**
 * The two tab styles of the design system, both real `role="tab"` buttons
 * inside a `role="tablist"`:
 *   - `underline` — section navigation inside a page (profile sections).
 *   - `segmented` — switching the view of one list (feed: Takip/Popüler/Sana Özel).
 * Both scroll horizontally on narrow screens instead of wrapping. `touch-
 * pan-x` locks the touch gesture to horizontal panning (so a swipe that
 * isn't perfectly horizontal doesn't also drag the whole page vertically)
 * and `overscroll-x-contain` stops that horizontal scroll from chaining
 * into the page's own vertical scroll once it hits an edge — both real
 * mobile bugs on iOS Safari, not cosmetic.
 */
export function Tabs<K extends string>({
  items,
  active,
  onChange,
  ariaLabel,
  variant = "underline",
  className,
}: {
  items: TabItem<K>[];
  active: K;
  onChange: (key: K) => void;
  ariaLabel: string;
  variant?: "underline" | "segmented";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "scrollbar-none flex touch-pan-x overflow-x-auto overscroll-x-contain",
        variant === "underline" ? "gap-1 border-b border-border-soft" : "w-fit max-w-full gap-1 rounded-md bg-surface-soft p-1",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.key === active;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.key)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-label font-medium transition-[color,background-color,border-color,box-shadow] duration-200 ease-soft",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 px-3 py-3",
                    selected ? "border-primary text-text" : "border-transparent text-text-muted hover:text-text",
                  )
                : cn(
                    "h-8 rounded-sm px-3",
                    selected ? "bg-surface text-text shadow-xs" : "text-text-muted hover:text-text",
                  ),
            )}
          >
            {Icon && <Icon size={15} className={selected ? "text-primary" : undefined} />}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-xs px-1.5 text-caption tabular-nums",
                  selected ? "bg-primary-soft text-primary" : "bg-surface-soft text-text-muted",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
