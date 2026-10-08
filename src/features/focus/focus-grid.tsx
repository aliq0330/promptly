"use client";

import type { FeedItem } from "@/features/feed/types";
import { feedItemKey } from "@/features/feed/types";
import { FocusCard } from "./focus-card";

/**
 * Focus View's grid — the same CSS-columns masonry the card view already uses
 * (so mixed picture / text / structure cards of different heights flow
 * naturally with no JS measuring), just denser: 2 columns on phones, 3 on
 * tablet / small desktop, 4 on wide screens. Each column is `minmax(0, 1fr)`-like
 * (CSS columns never exceed the container), so nothing can overflow sideways.
 * Empty / loading states stay the caller's job (it renders the card view's).
 */
export function FocusGrid({ items }: { items: FeedItem[] }) {
  return (
    <div className="columns-2 gap-2.5 sm:gap-3 md:columns-3 xl:columns-4">
      {items.map((item) => (
        <div key={feedItemKey(item)} className="mb-2.5 break-inside-avoid sm:mb-3">
          <FocusCard item={item} />
        </div>
      ))}
    </div>
  );
}
