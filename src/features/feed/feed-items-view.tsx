"use client";

import { FOCUS_GRID_NARROW_COLUMNS, FocusGrid } from "@/features/focus/focus-grid";
import { useViewMode } from "@/features/content/view-mode-store";
import { FeedGrid } from "./feed-grid";
import type { FeedItem } from "./types";

/**
 * Picks between the two list renderings: "Kart" = the existing, untouched
 * `FeedGrid` (all its props, empty states and cards exactly as before) and
 * "Izgara" = the Focus View (grid). An empty list always uses `FeedGrid`'s own
 * empty state in both modes, so filters / empty copy never differ.
 */
export function FeedItemsView(props: React.ComponentProps<typeof FeedGrid>) {
  const [mode] = useViewMode();
  const items: FeedItem[] = props.items;
  if (mode === "focus" && items.length > 0) return <FocusGrid items={items} columns={props.layout === "home" ? FOCUS_GRID_NARROW_COLUMNS : undefined} />;
  return <FeedGrid {...props} />;
}
