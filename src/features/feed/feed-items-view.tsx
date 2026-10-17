"use client";

import { FocusGrid } from "@/features/focus/focus-grid";
import { useViewMode } from "@/features/content/view-mode-store";
import { FeedGrid } from "./feed-grid";
import type { FeedItem } from "./types";

/**
 * Picks between the two list renderings: "Kart" = the existing, untouched
 * `FeedGrid` (all its props, empty states and cards exactly as before) and
 * "Odak" = the new Focus View. An empty list always uses `FeedGrid`'s own
 * empty state in both modes, so filters / empty copy never differ.
 */
export function FeedItemsView(props: React.ComponentProps<typeof FeedGrid>) {
  const [mode] = useViewMode();
  const items: FeedItem[] = props.items;
  // Home's stream (docs/history/190-*) is always cards; the Kart/Odak choice belongs to the grid lists.
  if (mode === "focus" && items.length > 0 && props.layout !== "stream") return <FocusGrid items={items} />;
  return <FeedGrid {...props} />;
}
