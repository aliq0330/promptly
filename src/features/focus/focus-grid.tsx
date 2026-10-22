"use client";

import { feedItemKey, isPostItem, type FeedItem } from "@/features/feed/types";
import { FocusCard } from "./focus-card";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils";

/**
 * Focus View's grid — the same CSS-columns masonry the card view already uses
 * (so mixed picture / text / structure cards of different heights flow
 * naturally with no JS measuring), just denser: 2 columns on phones, 3 on
 * tablet / small desktop, 4 on wide screens. Each column is `minmax(0, 1fr)`-like
 * (CSS columns never exceed the container), so nothing can overflow sideways.
 * Empty / loading states stay the caller's job (it renders the card view's). A page with a right rail
 * passes `FOCUS_GRID_NARROW_COLUMNS` (its main column is too narrow for four).
 */
export function FocusGrid({ items, columns = "md:columns-3 xl:columns-4" }: { items: FeedItem[]; columns?: string }) {
  // The Izgara view shows posts' outputs; a shared Space (docs/history/215-*) stays in the card view only.
  return (
    <div className={cn("columns-2 gap-2.5 sm:gap-3", columns)}>
      {items.filter(isPostItem).map((item, index) => (
        <Reveal key={feedItemKey(item)} index={index} className="pb-2.5 break-inside-avoid sm:pb-3">
          <FocusCard item={item} />
        </Reveal>
      ))}
    </div>
  );
}

/** Columns for a main column that has a right rail next to it (Ana Sayfa, Topluluklar): never four. */
export const FOCUS_GRID_NARROW_COLUMNS = "md:columns-3";
