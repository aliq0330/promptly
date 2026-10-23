"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ScrollRow } from "@/components/ui/scroll-row";
import { cn } from "@/lib/utils";

export interface TabItem<K extends string> {
  key: K;
  label: string;
  count?: number;
  icon?: LucideIcon;
}

/**
 * The tab styles of the design system, all real `role="tab"` buttons
 * inside a `role="tablist"`:
 *   - `underline` — section navigation inside a page (profile sections).
 *   - `segmented` — switching the view of one list (feed: Takip/Popüler/Sana Özel).
 *   - `pill` — Meydan's separate pills (community sections, docs/history/190-*);
 *     the selected pill is filled, so it needs no sliding indicator.
 * Both scroll horizontally on narrow screens instead of wrapping. `touch-
 * pan-x` locks the touch gesture to horizontal panning (so a swipe that
 * isn't perfectly horizontal doesn't also drag the whole page vertically)
 * and `overscroll-x-contain` stops that horizontal scroll from chaining
 * into the page's own vertical scroll once it hits an edge — both real
 * mobile bugs on iOS Safari, not cosmetic. The row is a `ScrollRow`, so a desktop mouse reaches the hidden tabs too (wheel, drag, arrows;
 * docs/history/219-*), and the chosen tab is brought into view when it changes (a deep link can select a tab past the edge).
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
  variant?: "underline" | "segmented" | "pill";
  className?: string;
}) {
  const listRef = useRef<HTMLElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const activeIndex = items.findIndex((item) => item.key === active);
  const labelsKey = items.map((item) => `${item.key}:${item.count ?? ""}`).join("|");

  // The active tab's box inside the (scrollable) list. The list is the
  // offset parent, so the indicator scrolls with the tabs; a ResizeObserver
  // keeps it right through font loading, count changes and rotation.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const tab = list.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex];
      setIndicator(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [activeIndex, labelsKey, variant]);

  // Only when the chosen tab changes: a resize or a new count must not yank a row the reader has scrolled.
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelectorAll<HTMLElement>('[role="tab"]')[activeIndex];
    if (!list || !tab) return;
    const gutter = 16;
    const right = tab.offsetLeft + tab.offsetWidth;
    if (tab.offsetLeft < list.scrollLeft + gutter) list.scrollLeft = Math.max(0, tab.offsetLeft - gutter);
    else if (right > list.scrollLeft + list.clientWidth - gutter) list.scrollLeft = right - list.clientWidth + gutter;
  }, [activeIndex]);

  return (
    <ScrollRow
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      wrapperClassName={className}
      className={cn(
        "relative",
        variant === "underline"
          ? "gap-1 border-b border-border-soft"
          : variant === "pill"
            ? "gap-2 py-0.5"
            : "w-fit max-w-full gap-0.5 rounded-lg border border-border-soft bg-surface-soft p-0.5",
      )}
    >
      {indicator && variant !== "pill" && (
        <span
          aria-hidden
          data-tab-indicator
          className={cn(
            "pointer-events-none absolute transition-[transform,width] duration-[var(--motion-normal)] ease-soft",
            variant === "underline"
              ? "bottom-0 left-0 h-0.5 rounded-full bg-primary"
              : "bottom-0.5 left-0 top-0.5 rounded-md bg-surface shadow-sm ring-1 ring-border-soft",
          )}
          style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
        />
      )}
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
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-label font-medium transition-[color,background-color,border-color,box-shadow] duration-200 ease-soft",
              variant === "underline"
                ? cn(
                    "-mb-px border-b-2 px-3 py-3",
                    // Until the indicator is measured (first paint) the tab draws its own mark.
                    selected ? cn("text-text", indicator ? "border-transparent" : "border-primary") : "border-transparent text-text-muted hover:text-text",
                  )
                : variant === "pill"
                  ? cn(
                      "h-9 rounded-full px-4 font-semibold",
                      selected ? "bg-text text-background" : "bg-surface-soft text-text-secondary hover:bg-border-soft hover:text-text",
                    )
                  : cn(
                    "h-8 rounded-md px-3",
                    selected
                      ? cn("text-text", !indicator && "bg-surface shadow-sm ring-1 ring-border-soft")
                      : "text-text-muted hover:text-text",
                  ),
            )}
          >
            {Icon && <Icon size={15} className={selected ? "text-primary" : undefined} />}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-xs px-1.5 text-caption tabular-nums",
                  variant === "pill"
                    ? selected
                      ? "bg-background/20 text-background"
                      : "bg-surface text-text-muted"
                    : selected
                      ? "bg-primary-soft text-primary"
                      : "bg-surface-soft text-text-muted",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </ScrollRow>
  );
}
